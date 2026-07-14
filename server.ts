import http from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { prisma } from "./lib/prisma";
import {
  emitRoomListUpdate,
  getRoomListChannel,
  setRoomListSocketServer
} from "./lib/room-list-events";
import { verifySocketTicket } from "./lib/socket-ticket";
import { Server, type Socket } from "socket.io";

type ChatMessage = {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  createdAt: string;
  mentions: MessageMentionRange[];
  unreadCount: number;
};

type MessageMentionRange = {
  end: number;
  label: string;
  start: number;
  userId: string;
};

type ChatPayload = {
  mentions?: Array<Partial<MessageMentionRange>>;
  roomId?: string;
  text?: string;
};

type ChatHistoryPayload = {
  lastReadAt: string | null;
  messages: ChatMessage[];
};

type JoinPayload = {
  email?: string;
  nickname?: string;
  roomId?: string;
  userId?: string;
};

type OnlineSubscribePayload = {
  email?: string;
  userId?: string;
};

type RoomsSubscribePayload = {
  ticket?: string;
};

type ReadPayload = {
  messageId?: string;
};

type ReadCountUpdate = {
  id: string;
  unreadCount: number;
};

type PresenceUser = {
  id: string;
  nickname: string;
  online: boolean;
  sockets: number;
};

type OnlineUser = {
  nickname: string;
  sockets: Set<string>;
  userId: string;
};

type SocketSession = {
  roomId: string;
  userId: string;
};

type AckResult = {
  ok: boolean;
  error?: string;
  nickname?: string;
  room?: {
    id: string;
    name: string;
    slug: string;
  };
};

type AckCallback = (result: AckResult) => void;

const dev = process.env.NODE_ENV !== "production";
loadEnvConfig(process.cwd(), dev);

const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = Number(process.env.PORT || 3001);

const socketSessions = new Map<string, SocketSession>();
const onlineRooms = new Map<string, Map<string, OnlineUser>>();
const onlineUsers = new Map<string, OnlineUser>();
const onlineUserSessions = new Map<string, string>();
const ONLINE_USERS_CHANNEL = "online-users";
const MAX_HISTORY = 50;
app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          rooms: onlineRooms.size,
          users: getTotalOnlineUsers(),
          uptime: Math.round(process.uptime())
        })
      );
      return;
    }

    handle(req, res);
  });

  const io = new Server(server);
  setRoomListSocketServer(io);

  io.on("connection", async (socket: Socket) => {
    socket.on(
      "users:subscribe",
      async (payload: OnlineSubscribePayload, ack?: AckCallback) => {
        const email = normalizeEmail(payload?.email);
        const userId = normalizeId(payload?.userId);

        if (!userId && !email) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "Signed-in user is required." });
          }
          return;
        }

        const dbUser = await findJoinUser({ email, userId });

        if (!dbUser) {
          if (typeof ack === "function") {
            ack({ ok: false, error: "Signed-in user was not found." });
          }
          return;
        }

        const nickname = formatMemberNickname(dbUser);
        registerOnlineUser(socket.id, dbUser.id, nickname);
        socket.join(ONLINE_USERS_CHANNEL);
        emitOnlineUsers(io);

        if (typeof ack === "function") {
          ack({ ok: true, nickname });
        }
      }
    );

    socket.on(
      "rooms:subscribe",
      async (payload: RoomsSubscribePayload, ack?: AckCallback) => {
        try {
          const ticket = verifySocketTicket(payload?.ticket);

          if (!ticket) {
            if (typeof ack === "function") {
              ack({ ok: false, error: "Room list subscription is unauthorized." });
            }
            return;
          }

          const user = await prisma.user.findUnique({
            where: { id: ticket.sub },
            select: { id: true }
          });

          if (!user) {
            if (typeof ack === "function") {
              ack({ ok: false, error: "Signed-in user was not found." });
            }
            return;
          }

          socket.join(getRoomListChannel(user.id));

          if (typeof ack === "function") {
            ack({ ok: true });
          }
        } catch (error) {
          console.error("Failed to subscribe to room list updates", error);

          if (typeof ack === "function") {
            ack({ ok: false, error: "Room list subscription failed." });
          }
        }
      }
    );

    socket.on("user:join", async (payload: JoinPayload, ack?: AckCallback) => {
      const email = normalizeEmail(payload?.email);
      const roomId = normalizeId(payload?.roomId);
      const userId = normalizeId(payload?.userId);

      if ((!userId && !email) || !roomId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Signed-in user and room are required." });
        }
        return;
      }

      const dbUser = await findJoinUser({ email, userId });
      const room = await findRoom(roomId);

      if (!dbUser) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Signed-in user was not found." });
        }
        return;
      }

      if (!room) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Chat room was not found." });
        }
        return;
      }

      const membership = await findRoomMembership({
        roomId: room.id,
        userId: dbUser.id
      });

      if (!membership) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Join the chat room before connecting." });
        }
        return;
      }

      const cleanName = normalizeNickname(
        payload?.nickname || dbUser.nickname || dbUser.name || dbUser.email
      );

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { nickname: cleanName }
      });

      registerOnlineUser(socket.id, dbUser.id, cleanName);
      emitOnlineUsers(io);

      removeSocketFromPresence(io, socket.id);

      socket.join(room.id);

      const roomUsers = getRoomPresence(room.id);
      const existingOnlineUser = roomUsers.get(dbUser.id);
      if (existingOnlineUser) {
        existingOnlineUser.nickname = cleanName;
        existingOnlineUser.sockets.add(socket.id);
      } else {
        roomUsers.set(dbUser.id, {
          nickname: cleanName,
          sockets: new Set([socket.id]),
          userId: dbUser.id
        });
      }

      socketSessions.set(socket.id, {
        roomId: room.id,
        userId: dbUser.id
      });
      socket.emit("user:ready", {
        id: dbUser.id,
        nickname: cleanName
      });

      await emitPresence(io, room.id);
      void emitRoomListUpdate(room.id, io).catch((error) => {
        console.error("Failed to update room list after joining", error);
      });

      try {
        const history: ChatHistoryPayload = {
          lastReadAt: membership.lastReadAt?.toISOString() || null,
          messages: await loadRecentMessages(room.id)
        };
        socket.emit("chat:history", history);
      } catch (error) {
        console.error("Failed to load chat history", error);
        socket.emit("chat:history", { lastReadAt: null, messages: [] });
      }

      if (typeof ack === "function") {
        ack({
          ok: true,
          nickname: cleanName,
          room: {
            id: room.id,
            name: room.name,
            slug: room.slug
          }
        });
      }
    });

    socket.on("chat:message", async (payload: ChatPayload, ack?: AckCallback) => {
      const session = socketSessions.get(socket.id);
      const user = session ? getRoomPresence(session.roomId).get(session.userId) : null;
      const text = normalizeMessage(payload && payload.text);

      if (!session || !user || !text) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Message is empty or user has not joined." });
        }
        return;
      }

      try {
        const message = await saveChatMessage({
          mentions: payload?.mentions,
          roomId: session.roomId,
          userId: user.userId,
          nickname: user.nickname,
          text
        });

        io.to(session.roomId).emit("chat:message", message);
        void emitRoomListUpdate(session.roomId, io).catch((error) => {
          console.error("Failed to update room list after message", error);
        });

        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        console.error("Failed to save chat message", error);

        if (typeof ack === "function") {
          ack({ ok: false, error: "Message could not be saved." });
        }
      }
    });

    socket.on("message:read", async (payload: ReadPayload, ack?: AckCallback) => {
      const session = socketSessions.get(socket.id);
      const messageId = normalizeId(payload?.messageId);

      if (!session || !messageId) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Message and joined room are required." });
        }
        return;
      }

      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          roomId: session.roomId
        },
        select: { createdAt: true }
      });

      if (!message) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Message was not found in this room." });
        }
        return;
      }

      try {
        const result = await prisma.roomMember.updateMany({
          where: {
            roomId: session.roomId,
            userId: session.userId,
            OR: [
              { lastReadAt: null },
              { lastReadAt: { lt: message.createdAt } }
            ]
          },
          data: { lastReadAt: message.createdAt }
        });

        if (result.count > 0) {
          io.to(session.roomId).emit(
            "message:read:update",
            await loadUnreadCountUpdates(session.roomId)
          );
          void emitRoomListUpdate(session.roomId, io).catch((error) => {
            console.error("Failed to update room unread count", error);
          });
        }

        if (typeof ack === "function") {
          ack({ ok: true });
        }
      } catch (error) {
        console.error("Failed to update message read state", error);

        if (typeof ack === "function") {
          ack({ ok: false, error: "Read state could not be updated." });
        }
      }
    });

    socket.on("disconnect", () => {
      const result = removeSocketFromPresence(io, socket.id);
      const onlineUserRemoved = removeOnlineUserSocket(socket.id);

      if (result) {
        void emitPresence(io, result.roomId);
      }

      if (onlineUserRemoved) {
        emitOnlineUsers(io);
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Next chat server running at http://localhost:${PORT}`);
  });
});

async function emitPresence(io: Server, roomId: string) {
  const users = await getRoomMembersWithPresence(roomId);

  io.to(roomId).emit("presence:update", {
    count: users.filter((user) => user.online).length,
    users
  });
}

function getUniquePresenceUsers(roomId: string) {
  return Array.from(getRoomPresence(roomId).values())
    .map((user): PresenceUser => ({
      id: user.userId,
      nickname: user.nickname,
      online: true,
      sockets: user.sockets.size
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
}

async function getRoomMembersWithPresence(roomId: string) {
  const onlineUsers = onlineRooms.get(roomId) || new Map<string, OnlineUser>();
  const members = await prisma.roomMember.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
    select: {
      user: {
        select: {
          email: true,
          id: true,
          name: true,
          nickname: true
        }
      }
    }
  });

  return members
    .map(({ user }): PresenceUser => {
      const onlineUser = onlineUsers.get(user.id);
      const nickname = onlineUser?.nickname || formatMemberNickname(user);

      return {
        id: user.id,
        nickname,
        online: Boolean(onlineUser),
        sockets: onlineUser?.sockets.size || 0
      };
    })
    .sort((a, b) => {
      if (a.online !== b.online) {
        return a.online ? -1 : 1;
      }

      return a.nickname.localeCompare(b.nickname);
    });
}

function getTotalOnlineUsers() {
  return onlineUsers.size;
}

function emitOnlineUsers(io: Server) {
  const users = Array.from(onlineUsers.values())
    .map((user) => ({
      id: user.userId,
      nickname: user.nickname,
      sockets: user.sockets.size
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));

  io.to(ONLINE_USERS_CHANNEL).emit("users:online", {
    count: users.length,
    users
  });
}

function registerOnlineUser(socketId: string, userId: string, nickname: string) {
  const previousUserId = onlineUserSessions.get(socketId);

  if (previousUserId && previousUserId !== userId) {
    removeOnlineUserSocket(socketId);
  }

  const existingUser = onlineUsers.get(userId);

  if (existingUser) {
    existingUser.nickname = nickname;
    existingUser.sockets.add(socketId);
  } else {
    onlineUsers.set(userId, {
      nickname,
      sockets: new Set([socketId]),
      userId
    });
  }

  onlineUserSessions.set(socketId, userId);
}

function removeOnlineUserSocket(socketId: string) {
  const userId = onlineUserSessions.get(socketId);

  if (!userId) {
    return false;
  }

  onlineUserSessions.delete(socketId);
  const user = onlineUsers.get(userId);

  if (user) {
    user.sockets.delete(socketId);

    if (user.sockets.size === 0) {
      onlineUsers.delete(userId);
    }
  }

  return true;
}

function getRoomPresence(roomId: string) {
  let roomUsers = onlineRooms.get(roomId);

  if (!roomUsers) {
    roomUsers = new Map<string, OnlineUser>();
    onlineRooms.set(roomId, roomUsers);
  }

  return roomUsers;
}

function removeSocketFromPresence(io: Server, socketId: string) {
  const session = socketSessions.get(socketId);

  if (!session) {
    return null;
  }

  const roomUsers = getRoomPresence(session.roomId);
  const user = roomUsers.get(session.userId) || null;
  socketSessions.delete(socketId);
  io.sockets.sockets.get(socketId)?.leave(session.roomId);

  if (user) {
    user.sockets.delete(socketId);

    if (user.sockets.size === 0) {
      roomUsers.delete(session.userId);
    }

    if (roomUsers.size === 0) {
      onlineRooms.delete(session.roomId);
    }
  }

  return user
    ? {
        roomId: session.roomId,
        user
      }
    : null;
}

function normalizeNickname(value: unknown) {
  const nickname = String(value || "").trim().replace(/\s+/g, " ");
  return nickname.slice(0, 24) || `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
}

function normalizeMessage(value: unknown) {
  return String(value || "").trim().slice(0, 500);
}

function normalizeEmail(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") ? email : null;
}

function normalizeId(value: unknown) {
  return String(value || "").trim() || null;
}

function findJoinUser({ email, userId }: { email: string | null; userId: string | null }) {
  if (userId) {
    return prisma.user.findFirst({
      where: {
        OR: [
          { id: userId },
          ...(email ? [{ email }] : [])
        ]
      },
      select: {
        email: true,
        id: true,
        name: true,
        nickname: true
      }
    });
  }

  return prisma.user.findUnique({
    where: { email: email || "" },
    select: {
      email: true,
      id: true,
      name: true,
      nickname: true
    }
  });
}

function formatMemberNickname(user: {
  email: string | null;
  name: string | null;
  nickname: string | null;
}) {
  return String(user.nickname || user.name || user.email || "Unknown user")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

function findRoom(roomId: string) {
  return prisma.room.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      slug: true
    }
  });
}

function findRoomMembership({ roomId, userId }: { roomId: string; userId: string }) {
  return prisma.roomMember.findUnique({
    where: {
      userId_roomId: {
        roomId,
        userId
      }
    }
  });
}

async function loadRecentMessages(roomId: string): Promise<ChatMessage[]> {
  const [rows, members] = await prisma.$transaction([
    prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      include: {
        mentions: {
          orderBy: { start: "asc" }
        }
      },
      take: MAX_HISTORY
    }),
    prisma.roomMember.findMany({
      where: { roomId },
      select: {
        createdAt: true,
        lastReadAt: true,
        userId: true
      }
    })
  ]);

  return rows.reverse().map((message) => ({
    id: message.id,
    userId: message.userId || "",
    nickname: message.nickname,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
    mentions: message.mentions.map((mention) => ({
      end: mention.end,
      label: mention.label,
      start: mention.start,
      userId: mention.mentionedUserId
    })),
    unreadCount: countUnreadMembers(message, members)
  }));
}

async function loadUnreadCountUpdates(roomId: string): Promise<ReadCountUpdate[]> {
  const messages = await loadRecentMessages(roomId);

  return messages.map(({ id, unreadCount }) => ({ id, unreadCount }));
}

function countUnreadMembers(
  message: { createdAt: Date; userId: string | null },
  members: Array<{ createdAt: Date; lastReadAt: Date | null; userId: string }>
) {
  return members.filter((member) => (
    member.userId !== message.userId &&
    member.createdAt <= message.createdAt &&
    (!member.lastReadAt || member.lastReadAt < message.createdAt)
  )).length;
}

async function saveChatMessage({
  mentions: mentionInputs,
  roomId,
  userId,
  nickname,
  text
}: {
  mentions?: Array<Partial<MessageMentionRange>>;
  roomId: string;
  userId: string;
  nickname: string;
  text: string;
}): Promise<ChatMessage> {
  const mentions = await validateMessageMentions({
    mentions: mentionInputs,
    roomId,
    text
  });
  const message = await prisma.message.create({
    data: {
      roomId,
      userId,
      nickname,
      text,
      mentions: mentions.length
        ? {
            create: mentions.map((mention) => ({
              end: mention.end,
              label: mention.label,
              mentionedUserId: mention.userId,
              start: mention.start
            }))
          }
        : undefined
    },
    include: {
      mentions: {
        orderBy: { start: "asc" }
      }
    }
  });
  const unreadCount = await prisma.roomMember.count({
    where: {
      roomId,
      userId: { not: userId },
      createdAt: { lte: message.createdAt },
      OR: [
        { lastReadAt: null },
        { lastReadAt: { lt: message.createdAt } }
      ]
    }
  });

  return {
    id: message.id,
    userId: message.userId || "",
    nickname: message.nickname,
    text: message.text,
    createdAt: message.createdAt.toISOString(),
    mentions: message.mentions.map((mention) => ({
      end: mention.end,
      label: mention.label,
      start: mention.start,
      userId: mention.mentionedUserId
    })),
    unreadCount
  };
}

async function validateMessageMentions({
  mentions,
  roomId,
  text
}: {
  mentions?: Array<Partial<MessageMentionRange>>;
  roomId: string;
  text: string;
}): Promise<MessageMentionRange[]> {
  if (!Array.isArray(mentions) || mentions.length === 0) {
    return [];
  }

  const candidates = mentions.slice(0, 20).flatMap((mention) => {
    const userId = normalizeId(mention?.userId);
    const label = String(mention?.label || "").trim();
    const start = Number(mention?.start);
    const end = Number(mention?.end);

    if (
      !userId ||
      !label ||
      label.length > 24 ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > text.length ||
      text.slice(start, end) !== `@${label}`
    ) {
      return [];
    }

    return [{ end, label, start, userId }];
  }).sort((left, right) => left.start - right.start || left.end - right.end);

  const nonOverlapping: MessageMentionRange[] = [];

  for (const mention of candidates) {
    const previous = nonOverlapping[nonOverlapping.length - 1];

    if (!previous || mention.start >= previous.end) {
      nonOverlapping.push(mention);
    }
  }
  const memberIds = Array.from(new Set(nonOverlapping.map(({ userId }) => userId)));
  const members = await prisma.roomMember.findMany({
    where: {
      roomId,
      userId: { in: memberIds }
    },
    select: {
      userId: true,
      user: {
        select: {
          email: true,
          name: true,
          nickname: true
        }
      }
    }
  });
  const labelsByUserId = new Map(
    members.map((member) => [member.userId, formatMemberNickname(member.user)])
  );

  return nonOverlapping.filter((mention) => (
    labelsByUserId.get(mention.userId) === mention.label
  ));
}
