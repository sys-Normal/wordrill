import http from "node:http";
import { loadEnvConfig } from "@next/env";
import next from "next";
import { PrismaClient } from "@prisma/client";
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
const prisma = new PrismaClient();

const users = new Map<string, string>();
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
          users: users.size,
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

    socket.on("user:join", (nickname: unknown, ack?: AckCallback) => {
      const cleanName = normalizeNickname(nickname);

      users.set(socket.id, cleanName);
      socket.emit("user:ready", {
        id: socket.id,
        nickname: cleanName
      });

      emitPresence(io);
      const message: SystemMessage = {
        id: createId(),
        text: `${cleanName} joined the room.`,
        createdAt: new Date().toISOString()
      };

      io.emit("system:message", message);

      if (typeof ack === "function") {
        ack({ ok: true, nickname: cleanName });
      }
    });

    socket.on("chat:message", async (payload: ChatPayload, ack?: AckCallback) => {
      const nickname = users.get(socket.id);
      const text = normalizeMessage(payload && payload.text);

      if (!nickname || !text) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Message is empty or user has not joined." });
        }
        return;
      }

      try {
        const message = await saveChatMessage({
          socketId: socket.id,
          nickname,
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
      const nickname = users.get(socket.id);
      users.delete(socket.id);

      if (nickname) {
        emitPresence(io);
        const message: SystemMessage = {
          id: createId(),
          text: `${nickname} left the room.`,
          createdAt: new Date().toISOString()
        };

        io.emit("system:message", message);
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Next chat server running at http://localhost:${PORT}`);
  });
});

function emitPresence(io: Server) {
  io.emit("presence:update", {
    count: users.size,
    users: Array.from(users.values()).sort((a, b) => a.localeCompare(b))
  });
}

function normalizeNickname(value: unknown) {
  const nickname = String(value || "").trim().replace(/\s+/g, " ");
  return nickname.slice(0, 24) || `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
}

function normalizeMessage(value: unknown) {
  return String(value || "").trim().slice(0, 500);
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
  socketId,
  nickname,
  text
}: {
  socketId: string;
  nickname: string;
  text: string;
}): Promise<ChatMessage> {
  const roomId = await getDefaultRoomId();
  const message = await prisma.message.create({
    data: {
      roomId,
      nickname,
      text
    }
  });

  return {
    id: message.id,
    userId: socketId,
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
