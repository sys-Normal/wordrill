import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";
import { io } from "socket.io-client";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd(), true);

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to run realtime verification in production.");
}

const prisma = new PrismaClient();
const baseUrl = "http://localhost:3001";

class CookieJar {
  cookies = new Map();

  capture(response) {
    const values = response.headers.getSetCookie?.() || [];

    for (const value of values) {
      const [pair, ...attributes] = value.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const cookieValue = pair.slice(separator + 1);
      const removed = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));

      if (removed || !cookieValue) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, cookieValue);
      }
    }
  }

  header() {
    return Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join("; ");
  }
}

async function request(jar, path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      ...(jar.header() ? { cookie: jar.header() } : {})
    },
    redirect: "manual"
  });
  jar.capture(response);
  return response;
}

async function login(identifier, password) {
  const jar = new CookieJar();
  const csrf = await (await request(jar, "/api/auth/csrf")).json();
  const response = await request(jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      identifier,
      password,
      redirectTo: `${baseUrl}/rooms`
    })
  });

  if (response.status !== 302) {
    throw new Error(`${identifier} login failed with ${response.status}`);
  }

  const session = await (await request(jar, "/api/auth/session")).json();
  return { jar, session };
}

async function createTicket(jar) {
  const response = await request(jar, "/api/socket-ticket", { method: "POST" });

  if (!response.ok) {
    throw new Error(`Socket ticket failed with ${response.status}`);
  }

  return (await response.json()).ticket;
}

function waitForEvent(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handleEvent);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handleEvent = (payload) => {
      clearTimeout(timeout);
      resolve(payload);
    };
    socket.once(event, handleEvent);
  });
}

function waitForMatchingEvent(socket, event, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, handleEvent);
      reject(new Error(`Timed out waiting for matching ${event}`));
    }, timeoutMs);
    const handleEvent = (payload) => {
      if (!predicate(payload)) {
        return;
      }

      clearTimeout(timeout);
      socket.off(event, handleEvent);
      resolve(payload);
    };
    socket.on(event, handleEvent);
  });
}

function emitWithAck(socket, event, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} acknowledgement timed out`)), timeoutMs);
    socket.emit(event, payload, (result) => {
      clearTimeout(timeout);

      if (!result?.ok) {
        reject(new Error(result?.error || `${event} failed`));
      } else {
        resolve(result);
      }
    });
  });
}

const sockets = [];
const roomIds = [];

try {
  const [tester1, tester2] = await Promise.all([
    login("tester1", "wordrill1"),
    login("tester2", "wordrill2")
  ]);
  const room = await prisma.room.create({
    data: {
      name: `Realtime verification ${Date.now()}`,
      slug: `realtime-verification-${Date.now()}`,
      members: {
        create: { userId: tester1.session.user.id, lastReadAt: new Date() }
      }
    }
  });
  const roomId = room.id;
  roomIds.push(roomId);
  const [tester1Ticket, tester2Ticket] = await Promise.all([
    createTicket(tester1.jar),
    createTicket(tester2.jar)
  ]);
  const listSocket = io(baseUrl, { forceNew: true, transports: ["websocket"] });
  const chatSocket = io(baseUrl, { forceNew: true, transports: ["websocket"] });
  sockets.push(listSocket, chatSocket);

  await Promise.all([
    waitForEvent(listSocket, "connect"),
    waitForEvent(chatSocket, "connect")
  ]);
  await emitWithAck(listSocket, "rooms:subscribe", { ticket: tester2Ticket });

  const createdUpdatePromise = waitForEvent(listSocket, "room:updated");
  const createdResponse = await request(tester2.jar, "/api/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: `Created room verification ${Date.now()}` })
  });
  const createdRoom = (await createdResponse.json()).room;
  roomIds.push(createdRoom.id);
  const createdUpdate = await createdUpdatePromise;

  if (createdUpdate.id !== createdRoom.id || createdUpdate.messageCount !== 0) {
    throw new Error("Room creation did not emit its initial room summary");
  }

  const joinedUpdatePromise = waitForEvent(listSocket, "room:updated");
  const joinedResponse = await request(
    tester2.jar,
    `/api/rooms/${encodeURIComponent(roomId)}/join`,
    { method: "POST" }
  );

  if (!joinedResponse.ok || (await joinedUpdatePromise).id !== roomId) {
    throw new Error("Room join did not emit the joined room summary");
  }

  const senderHistoryPromise = waitForEvent(chatSocket, "chat:history");
  await emitWithAck(chatSocket, "user:join", {
    email: tester1.session.user.email,
    nickname: "Tester 1",
    roomId,
    userId: tester1.session.user.id
  });
  const senderHistory = await senderHistoryPromise;

  if (!Array.isArray(senderHistory.messages) || senderHistory.messages.length > 50) {
    throw new Error("Chat history did not respect the configured 50-message limit");
  }

  const mentionLabel = "Tester 2";
  const mentionToken = `@${mentionLabel}`;
  const messageText = `${mentionToken} room-list-update-${Date.now()}`;
  const updatePromise = waitForMatchingEvent(
    listSocket,
    "room:updated",
    (payload) => payload.id === roomId && payload.lastMessage?.text === messageText
  );
  const sentMessagePromise = waitForEvent(chatSocket, "chat:message");
  await emitWithAck(chatSocket, "chat:message", {
    roomId,
    text: messageText,
    mentions: [{
      end: mentionToken.length,
      label: mentionLabel,
      start: 0,
      userId: tester2.session.user.id
    }]
  });
  const [update, sentMessage] = await Promise.all([updatePromise, sentMessagePromise]);
  const roomsResponse = await request(tester2.jar, "/api/rooms");
  const rooms = (await roomsResponse.json()).rooms;

  if (
    update.id !== roomId ||
    update.lastMessage?.text !== messageText ||
    update.messageCount !== 1 ||
    update.mentionCount !== 1 ||
    update.unreadCount !== 1
  ) {
    throw new Error("room:updated payload did not contain the persisted room summary");
  }

  if (
    rooms[0]?.id !== roomId ||
    rooms[0]?.lastMessage?.text !== messageText ||
    rooms[0]?.mentionCount !== 1 ||
    rooms[0]?.unreadCount !== 1
  ) {
    throw new Error("Room list API was not sorted by latest message descending");
  }

  const readerSocket = io(baseUrl, { forceNew: true, transports: ["websocket"] });
  sockets.push(readerSocket);
  await waitForEvent(readerSocket, "connect");
  const readerHistoryPromise = waitForEvent(readerSocket, "chat:history");
  const readerJoinUpdatePromise = waitForEvent(listSocket, "room:updated");
  await emitWithAck(readerSocket, "user:join", {
    email: tester2.session.user.email,
    nickname: "Tester 2",
    roomId,
    userId: tester2.session.user.id
  });
  const [readerHistory] = await Promise.all([
    readerHistoryPromise,
    readerJoinUpdatePromise
  ]);

  if (!readerHistory.lastReadAt || readerHistory.messages.length > 50) {
    throw new Error("Chat history did not include the member's last read position");
  }

  if (
    sentMessage.mentions?.length !== 1 ||
    sentMessage.mentions[0].userId !== tester2.session.user.id ||
    sentMessage.mentions[0].label !== mentionLabel
  ) {
    throw new Error("Mention metadata was not persisted and broadcast correctly");
  }

  const readUpdatePromise = waitForMatchingEvent(
    listSocket,
    "room:updated",
    (payload) => (
      payload.id === roomId &&
      payload.lastMessage?.text === messageText &&
      payload.unreadCount === 0 &&
      payload.mentionCount === 0
    )
  );
  await emitWithAck(readerSocket, "message:read", { messageId: sentMessage.id });
  const readUpdate = await readUpdatePromise;

  if (
    readUpdate.id !== roomId ||
    readUpdate.unreadCount !== 0 ||
    readUpdate.mentionCount !== 0
  ) {
    throw new Error("Reading the latest message did not clear unread and mention counts");
  }

  console.log(JSON.stringify({
    apiFirstRoom: rooms[0].id,
    createdRoomEvent: createdUpdate.id,
    eventRoom: update.id,
    lastMessageCreatedAt: update.lastMessage.createdAt,
    messageCount: update.messageCount,
    mentionAfterRead: readUpdate.mentionCount,
    mentionBeforeRead: update.mentionCount,
    unreadAfterRead: readUpdate.unreadCount,
    unreadBeforeRead: update.unreadCount,
    ok: true
  }));
} finally {
  for (const socket of sockets) {
    socket.disconnect();
  }

  for (const id of roomIds) {
    await prisma.room.delete({ where: { id } }).catch(() => undefined);
  }

  await prisma.$disconnect();
}
