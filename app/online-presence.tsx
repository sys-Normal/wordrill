"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { useSession } from "next-auth/react";
import type { Socket } from "socket.io-client";
import { createAuthenticatedSocket } from "../lib/authenticated-socket";

export type OnlineDirectoryUser = {
  id: string;
  nickname: string;
  sockets: number;
};

type OnlinePresenceValue = {
  connected: boolean;
  count: number;
  users: OnlineDirectoryUser[];
};

const OnlinePresenceContext = createContext<OnlinePresenceValue>({
  connected: false,
  count: 0,
  users: []
});

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState<OnlineDirectoryUser[]>([]);

  useEffect(() => {
    if (status !== "authenticated") {
      setConnected(false);
      setUsers([]);
      return;
    }

    const socket: Socket = createAuthenticatedSocket();

    function subscribe() {
      socket.emit("users:subscribe", {}, (result: { ok?: boolean }) => {
        setConnected(Boolean(result?.ok));
      });
    }

    function handleOnlineUsers(payload: {
      count?: number;
      users?: OnlineDirectoryUser[];
    }) {
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
    }

    socket.on("connect", subscribe);
    socket.on("connect_error", () => setConnected(false));
    socket.on("disconnect", () => setConnected(false));
    socket.on("users:online", handleOnlineUsers);
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [status]);

  const value = useMemo(
    () => ({ connected, count: users.length, users }),
    [connected, users]
  );

  return (
    <OnlinePresenceContext.Provider value={value}>
      {children}
    </OnlinePresenceContext.Provider>
  );
}

export function useOnlinePresence() {
  return useContext(OnlinePresenceContext);
}
