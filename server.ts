import http from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { prisma } from "./lib/prisma";
import { Server, type Socket } from "socket.io";

type ChatMessage = {
  id: string;
  userId: string;
  nickname: string;
  text: string;
  createdAt: string;
};

type SystemMessage = {
  id: string;
  text: string;
  createdAt: string;
};

type ChatPayload = {
  roomSlug?: string;
  text?: string;
};

type JoinPayload = {
  email?: string;
  nickname?: string;
  roomSlug?: string;
  userId?: string;
};

type PresenceUser = {
  id: string;
  nickname: string;
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
const MAX_HISTORY = 50;
const DEFAULT_ROOM = {
  name: "General",
  slug: "general"
};
let defaultRoomIdPromise: Promise<string> | null = null;

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

  io.on("connection", async (socket: Socket) => {
    socket.on("user:join", async (payload: JoinPayload, ack?: AckCallback) => {
      const email = normalizeEmail(payload?.email);
      const roomSlug = normalizeSlug(payload?.roomSlug) || DEFAULT_ROOM.slug;
      const userId = normalizeId(payload?.userId);

      if (!userId && !email) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Signed-in user is required." });
        }
        return;
      }

      const dbUser = await findJoinUser({ email, userId });
      const room = await findRoom(roomSlug);

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

      const cleanName = normalizeNickname(
        payload?.nickname || dbUser.nickname || dbUser.name || dbUser.email
      );

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { nickname: cleanName }
      });

      await ensureRoomMembership({
        roomId: room.id,
        userId: dbUser.id
      });

      removeSocketFromPresence(io, socket.id);

      socket.join(room.id);

      const roomUsers = getRoomPresence(room.id);
      const existingOnlineUser = roomUsers.get(dbUser.id);
      const wasAlreadyOnline = Boolean(existingOnlineUser);

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

      emitPresence(io, room.id);

      try {
        socket.emit("chat:history", await loadRecentMessages(room.id));
      } catch (error) {
        console.error("Failed to load chat history", error);
        socket.emit("chat:history", []);
      }

      if (!wasAlreadyOnline) {
        const message: SystemMessage = {
          id: createId(),
          text: `${cleanName} joined the room.`,
          createdAt: new Date().toISOString()
        };

        socket.to(room.id).emit("system:message", message);
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
          roomId: session.roomId,
          userId: user.userId,
          nickname: user.nickname,
          text
        });

        io.to(session.roomId).emit("chat:message", message);

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

    socket.on("disconnect", () => {
      const result = removeSocketFromPresence(io, socket.id);

      if (result) {
        emitPresence(io, result.roomId);
        if (result.user.sockets.size === 0) {
          const message: SystemMessage = {
            id: createId(),
            text: `${result.user.nickname} left the room.`,
            createdAt: new Date().toISOString()
          };

          socket.to(result.roomId).emit("system:message", message);
        }
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Next chat server running at http://localhost:${PORT}`);
  });
});

function emitPresence(io: Server, roomId: string) {
  io.to(roomId).emit("presence:update", {
    count: getUniquePresenceUsers(roomId).length,
    users: getUniquePresenceUsers(roomId)
  });
}

function getUniquePresenceUsers(roomId: string) {
  return Array.from(getRoomPresence(roomId).values())
    .map((user): PresenceUser => ({
      id: user.userId,
      nickname: user.nickname,
      sockets: user.sockets.size
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
}

function getTotalOnlineUsers() {
  const userIds = new Set<string>();

  for (const roomUsers of onlineRooms.values()) {
    for (const userId of roomUsers.keys()) {
      userIds.add(userId);
    }
  }

  return userIds.size;
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

function normalizeSlug(value: unknown) {
  const slug = String(value || "").trim().toLowerCase();
  return slug.replace(/[^a-z0-9-]/g, "") || null;
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

function findRoom(slug: string) {
  return prisma.room.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true
    }
  });
}

function ensureRoomMembership({ roomId, userId }: { roomId: string; userId: string }) {
  return prisma.roomMember.upsert({
    where: {
      userId_roomId: {
        roomId,
        userId
      }
    },
    update: {},
    create: {
      roomId,
      userId
    }
  });
}

async function loadRecentMessages(roomId: string): Promise<ChatMessage[]> {
  const rows = await prisma.message.findMany({
    where: { roomId },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY
  });

  return rows.reverse().map((message) => ({
    id: message.id,
    userId: message.userId || "",
    nickname: message.nickname,
    text: message.text,
    createdAt: message.createdAt.toISOString()
  }));
}

async function saveChatMessage({
  roomId,
  userId,
  nickname,
  text
}: {
  roomId: string;
  userId: string;
  nickname: string;
  text: string;
}): Promise<ChatMessage> {
  const message = await prisma.message.create({
    data: {
      roomId,
      userId,
      nickname,
      text
    }
  });

  return {
    id: message.id,
    userId: message.userId || "",
    nickname: message.nickname,
    text: message.text,
    createdAt: message.createdAt.toISOString()
  };
}

function getDefaultRoomId() {
  defaultRoomIdPromise ??= prisma.room
    .upsert({
      where: { slug: DEFAULT_ROOM.slug },
      update: {},
      create: DEFAULT_ROOM
    })
    .then((room) => room.id);

  return defaultRoomIdPromise;
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
