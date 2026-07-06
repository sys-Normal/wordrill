"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";

type User = {
  id: string;
  nickname: string;
};

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

type Message =
  | ({ type: "chat" } & ChatMessage)
  | ({ type: "system" } & SystemMessage);

type Presence = {
  count: number;
  users: string[];
};

type AckResult = {
  ok: boolean;
  error?: string;
  nickname?: string;
};

export default function Home() {
  const socketRef = useRef<Socket | null>(null);
  const messagesRef = useRef<HTMLOListElement | null>(null);
  const [nickname, setNickname] = useState("");
  const [draft, setDraft] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [presence, setPresence] = useState<Presence>({ count: 0, users: [] });

  const socket = useMemo<Socket | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return io();
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    socketRef.current = socket;

    socket.on("user:ready", (user: User) => {
      setCurrentUserId(user.id);
    });

    socket.on("chat:history", (history: ChatMessage[]) => {
      setMessages(history.map((message) => ({ type: "chat", ...message })));
    });

    socket.on("chat:message", (message: ChatMessage) => {
      setMessages((current) => [...current, { type: "chat", ...message }]);
    });

    socket.on("system:message", (message: SystemMessage) => {
      setMessages((current) => [...current, { type: "system", ...message }]);
    });

    socket.on("presence:update", (nextPresence: Presence) => {
      setPresence(nextPresence);
    });

    return () => {
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    messagesRef.current?.scrollTo({
      top: messagesRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [messages]);

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    socketRef.current?.emit("user:join", nickname, (result: AckResult) => {
      if (result?.ok) {
        setJoined(true);
      }
    });
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();

    if (!text) {
      return;
    }

    socketRef.current?.emit("chat:message", { text }, (result: AckResult) => {
      if (result?.ok) {
        setDraft("");
      }
    });
  }

  return (
    <main className="appShell">
      <section className="chatPanel" aria-label="Chat room">
        <header className="chatHeader">
          <div>
            <p className="eyebrow">Next.js local test room</p>
            <h1>Wordrill Chat</h1>
          </div>
          <div className="statusPill" aria-live="polite">
            <span className="statusDot" />
            <span>{presence.count} online</span>
          </div>
        </header>

        {!joined ? (
          <div className="joinView">
            <form className="joinForm" onSubmit={joinRoom}>
              <label htmlFor="nickname">Nickname</label>
              <div className="joinRow">
                <input
                  id="nickname"
                  maxLength={24}
                  autoComplete="nickname"
                  placeholder="e.g. kww"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                />
                <button type="submit">Join</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="roomView">
            <aside className="sidebar" aria-label="Online users">
              <p className="sidebarTitle">Online</p>
              <ul className="userList">
                {presence.users.map((user) => (
                  <li key={user}>{user}</li>
                ))}
              </ul>
            </aside>

            <section className="conversation" aria-label="Messages">
              <ol ref={messagesRef} className="messages" aria-live="polite">
                {messages.map((message) =>
                  message.type === "system" ? (
                    <li key={message.id} className="message system">
                      {message.text}
                    </li>
                  ) : (
                    <li
                      key={message.id}
                      className={`message ${message.userId === currentUserId ? "mine" : ""}`}
                    >
                      <div className="messageMeta">
                        <span className="messageAuthor">{message.nickname}</span>
                        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                      </div>
                      <div className="messageText">{message.text}</div>
                    </li>
                  )
                )}
              </ol>

              <form className="messageForm" onSubmit={sendMessage}>
                <input
                  maxLength={500}
                  autoComplete="off"
                  placeholder="메시지를 입력하세요"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button type="submit">Send</button>
              </form>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
