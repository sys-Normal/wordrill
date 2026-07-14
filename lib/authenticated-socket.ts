"use client";

import { io, type ManagerOptions, type Socket, type SocketOptions } from "socket.io-client";

export function createAuthenticatedSocket(
  options: Partial<ManagerOptions & SocketOptions> = {}
): Socket {
  return io({
    ...options,
    autoConnect: false,
    auth: async (callback) => {
      try {
        const response = await fetch("/api/socket-ticket", { method: "POST" });

        if (!response.ok) {
          throw new Error("Socket ticket request failed.");
        }

        const data = await response.json();
        callback({ ticket: data.ticket });
      } catch {
        callback({ ticket: null });
      }
    }
  });
}
