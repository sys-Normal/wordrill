import type { Server } from "socket.io";
import { getRoomSummaryWithMemberIds } from "./room-summary";

const SOCKET_SERVER_KEY = Symbol.for("wordrill.socket-server");

type SocketGlobal = typeof globalThis & {
  [SOCKET_SERVER_KEY]?: Server;
};

export function setRoomListSocketServer(io: Server) {
  (globalThis as SocketGlobal)[SOCKET_SERVER_KEY] = io;
}

export async function emitRoomListUpdate(roomId: string, server?: Server) {
  const io = server || (globalThis as SocketGlobal)[SOCKET_SERVER_KEY];

  if (!io) {
    return;
  }

  const result = await getRoomSummaryWithMemberIds(roomId);

  if (!result) {
    return;
  }

  for (const { summary, userId } of result.summaries) {
    io.to(getRoomListChannel(userId)).emit("room:updated", summary);
  }
}

export function getRoomListChannel(userId: string) {
  return `room-list:${userId}`;
}
