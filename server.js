const http = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const PORT = Number(process.env.PORT || 3001);

const users = new Map();
const messages = [];
const MAX_HISTORY = 50;

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          users: users.size,
          messages: messages.length,
          uptime: Math.round(process.uptime())
        })
      );
      return;
    }

    handle(req, res);
  });

  const io = new Server(server);

  io.on("connection", (socket) => {
    socket.emit("chat:history", messages);

    socket.on("user:join", (nickname, ack) => {
      const cleanName = normalizeNickname(nickname);

      users.set(socket.id, cleanName);
      socket.emit("user:ready", {
        id: socket.id,
        nickname: cleanName
      });

      emitPresence(io);
      io.emit("system:message", {
        id: createId(),
        text: `${cleanName} joined the room.`,
        createdAt: new Date().toISOString()
      });

      if (typeof ack === "function") {
        ack({ ok: true, nickname: cleanName });
      }
    });

    socket.on("chat:message", (payload, ack) => {
      const nickname = users.get(socket.id);
      const text = normalizeMessage(payload && payload.text);

      if (!nickname || !text) {
        if (typeof ack === "function") {
          ack({ ok: false, error: "Message is empty or user has not joined." });
        }
        return;
      }

      const message = {
        id: createId(),
        userId: socket.id,
        nickname,
        text,
        createdAt: new Date().toISOString()
      };

      messages.push(message);
      if (messages.length > MAX_HISTORY) {
        messages.shift();
      }

      io.emit("chat:message", message);

      if (typeof ack === "function") {
        ack({ ok: true });
      }
    });

    socket.on("disconnect", () => {
      const nickname = users.get(socket.id);
      users.delete(socket.id);

      if (nickname) {
        emitPresence(io);
        io.emit("system:message", {
          id: createId(),
          text: `${nickname} left the room.`,
          createdAt: new Date().toISOString()
        });
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`Next chat server running at http://localhost:${PORT}`);
  });
});

function emitPresence(io) {
  io.emit("presence:update", {
    count: users.size,
    users: Array.from(users.values()).sort((a, b) => a.localeCompare(b))
  });
}

function normalizeNickname(value) {
  const nickname = String(value || "").trim().replace(/\s+/g, " ");
  return nickname.slice(0, 24) || `Guest-${Math.floor(Math.random() * 9000) + 1000}`;
}

function normalizeMessage(value) {
  return String(value || "").trim().slice(0, 500);
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
