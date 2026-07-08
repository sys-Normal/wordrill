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
  text?: string;
};

type JoinPayload = {
  email?: string;
  nickname?: string;
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

type AckResult = {
  ok: boolean;
  error?: string;
  nickname?: string;
};

type AckCallback = (result: AckResult) => void;

const dev = process.env.NODE_ENV !== "production";
loadEnvConfig(process.cwd(), dev);

const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = Number(process.env.PORT || 3001);

const socketUsers = new Map<string, string>();
const onlineUsers = new Map<string, OnlineUser>();
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
          users: getUniquePresenceUsers().length,
          uptime: Math.round(process.uptime())
        })
      );
      return;
    }

    handle(req, res);
  });

  const io = new Server(server);

  io.on("connection", async (socket: Socket) => {
    try {
      socket.emit("chat:history", await loadRecentMessages());
    } catch (error) {
      console.error("Failed to load chat history", error);
      socket.emit("chat:history", []);
    }

    socket.on("user:join", async (payload: JoinPayload, ack?: AckCallback) => {
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

      const cleanName = normalizeNickname(
        payload?.nickname || dbUser.nickname || dbUser.name || dbUser.email
      );

      await prisma.user.update({
        where: { id: dbUser.id },
        data: { nickname: cleanName }
      });

      removeSocketFromPresence(socket.id);

      const existingOnlineUser = onlineUsers.get(dbUser.id);
      const wasAlreadyOnline = Boolean(existingOnlineUser);

      if (existingOnlineUser) {
        existingOnlineUser.nickname = cleanName;
        existingOnlineUser.sockets.add(socket.id);
      } else {
        onlineUsers.set(dbUser.id, {
          nickname: cleanName,
          sockets: new Set([socket.id]),
          userId: dbUser.id
        });
      }

      socketUsers.set(socket.id, dbUser.id);
      socket.emit("user:ready", {
        id: dbUser.id,
        nickname: cleanName
      });

      emitPresence(io);

      if (!wasAlreadyOnline) {
        const message: SystemMessage = {
          id: createId(),
          text: `${cleanName} joined the room.`,
          createdAt: new Date().toISOString()
        };

        socket.broadcast.emit("system:message", message);
      }

      if (typeof ack === "function") {
        ack({ ok: true, nickname: cleanName });
      }
    });

    socket.on("chat:message", async (payload: ChatPayload, ack?: AckCallback) => {
      const userId = socketUsers.get(socket.id);
      const user = userId ? onlineUsers.get(userId) : null;
      const text = normalizeMessage(payload && payload.text);

      if (!user || !text) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Message is empty or user has not joined." });
        }
        return;
      }

      try {
        const message = await saveChatMessage({
          userId: user.userId,
          nickname: user.nickname,
          text
        });

        io.emit("chat:message", message);

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
      const user = removeSocketFromPresence(socket.id);

      if (user) {
        emitPresence(io);
        if (user.sockets.size === 0) {
          const message: SystemMessage = {
            id: createId(),
            text: `${user.nickname} left the room.`,
            createdAt: new Date().toISOString()
          };

          io.emit("system:message", message);
        }
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Next chat server running at http://localhost:${PORT}`);
  });
});

function emitPresence(io: Server) {
  io.emit("presence:update", {
    count: getUniquePresenceUsers().length,
    users: getUniquePresenceUsers()
  });
}

function getUniquePresenceUsers() {
  return Array.from(onlineUsers.values())
    .map((user): PresenceUser => ({
      id: user.userId,
      nickname: user.nickname,
      sockets: user.sockets.size
    }))
    .sort((a, b) => a.nickname.localeCompare(b.nickname));
}

function removeSocketFromPresence(socketId: string) {
  const userId = socketUsers.get(socketId);

  if (!userId) {
    return null;
  }

  const user = onlineUsers.get(userId) || null;
  socketUsers.delete(socketId);

  if (user) {
    user.sockets.delete(socketId);

    if (user.sockets.size === 0) {
      onlineUsers.delete(userId);
    }
  }

  return user;
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

async function loadRecentMessages(): Promise<ChatMessage[]> {
  const roomId = await getDefaultRoomId();
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
  userId,
  nickname,
  text
}: {
  userId: string;
  nickname: string;
  text: string;
}): Promise<ChatMessage> {
  const roomId = await getDefaultRoomId();
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
