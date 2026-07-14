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
import { io, type Socket } from "socket.io-client";

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
  const { data: session, status } = useSession();
  const [connected, setConnected] = useState(false);
  const [users, setUsers] = useState<OnlineDirectoryUser[]>([]);

  useEffect(() => {
    if (status !== "authenticated") {
      setConnected(false);
      setUsers([]);
      return;
    }

    const socket: Socket = io();

    function subscribe() {
      socket.emit("users:subscribe", {
        email: session?.user?.email,
        userId: session?.user?.id
      });
      setConnected(true);
    }

    function handleOnlineUsers(payload: {
      count?: number;
      users?: OnlineDirectoryUser[];
    }) {
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
    }

    socket.on("connect", subscribe);
    socket.on("disconnect", () => setConnected(false));
    socket.on("users:online", handleOnlineUsers);

    return () => {
      socket.disconnect();
    };
  }, [session?.user?.email, session?.user?.id, status]);

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
