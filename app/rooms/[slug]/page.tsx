"use client";

import type { FormEvent } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useParams } from "next/navigation";
import type { Socket } from "socket.io-client";
import { io } from "socket.io-client";
import {
  browserStorageKeys,
  getSessionStorageItem,
  removeSessionStorageItem,
  setSessionStorageItem
} from "../../../lib/browser-storage";
import AppMenu from "../../app-menu";

type User = {
  id: string;
  nickname: string;
  online?: boolean;
  sockets?: number;
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
  users: User[];
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

export default function RoomPage() {
  const params = useParams<{ slug: string }>();
  const roomSlug = String(params.slug || "");
  const { data: session, status } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const messagesRef = useRef<HTMLOListElement | null>(null);
  const [roomName, setRoomName] = useState("");
  const [nickname, setNickname] = useState("");
  const [draft, setDraft] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [presence, setPresence] = useState<Presence>({ count: 0, users: [] });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const isAuthenticated = status === "authenticated";
  const sessionName = session?.user?.name || session?.user?.email || "";
  const activeUserId = profileUserId || session?.user?.id || null;
  const activeUserEmail = session?.user?.email || null;

  const visiblePresence = useMemo<Presence>(() => {
    const uniqueUsers = new Map<string, User>();

    for (const user of presence.users) {
      const current = uniqueUsers.get(user.id);

      uniqueUsers.set(user.id, {
        ...user,
        online: Boolean(user.online),
        sockets: (current?.sockets || 0) + (user.sockets || 1)
      });
    }

    const users = Array.from(uniqueUsers.values()).sort((a, b) => {
      if (Boolean(a.online) !== Boolean(b.online)) {
        return a.online ? -1 : 1;
      }

      return a.nickname.localeCompare(b.nickname);
    });

    return {
      count: users.length,
      users
    };
  }, [presence]);

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
    socket.connect();

    socket.on("connect", () => {
      setSocketConnected(true);
    });

    socket.on("disconnect", () => {
      setSocketConnected(false);
      setJoined(false);
      setPresence({ count: 0, users: [] });
    });

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

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    setProfileLoaded(false);
    setJoinError("");
    fetch("/api/profile")
      .then((response) => response.json())
      .then((data) => {
        const nextUserId = data.user?.id || session?.user?.id || null;
        const savedNickname = normalizeNickname(data.user?.nickname);
        const storedNickname = normalizeNickname(
          getSessionStorageItem(browserStorageKeys.session.chat.lastNickname)
        );
        const fallbackNickname = normalizeNickname(sessionName);
        const nextNickname = savedNickname || storedNickname || fallbackNickname;

        if (nextNickname) {
          setNickname(nextNickname);
        }

        setProfileUserId(nextUserId);
      })
      .catch(() => {
        setProfileUserId(session?.user?.id || null);
      })
      .finally(() => setProfileLoaded(true));
  }, [session?.user?.id, sessionName, status]);

  useEffect(() => {
    if (
      !socket ||
      !socketConnected ||
      !isAuthenticated ||
      !profileLoaded ||
      joined ||
      !nickname ||
      !roomSlug ||
      (!activeUserId && !activeUserEmail)
    ) {
      return;
    }

    joinSocketRoom();
  }, [
    activeUserEmail,
    activeUserId,
    isAuthenticated,
    joined,
    nickname,
    profileLoaded,
    roomSlug,
    socket,
    socketConnected
  ]);

  function joinSocketRoom() {
    socketRef.current?.emit("user:join", {
      email: activeUserEmail,
      nickname,
      roomSlug,
      userId: activeUserId
    }, (result: AckResult) => {
      if (result?.ok) {
        setSessionStorageItem(
          browserStorageKeys.session.chat.lastNickname,
          result.nickname || nickname
        );
        setRoomName(result.room?.name || roomSlug);
        setJoinError("");
        setJoined(true);
      } else {
        setJoinError(result?.error || "채팅방에 입장하지 못했습니다.");
      }
    });
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError("");

    if (!activeUserId && !activeUserEmail) {
      setJoinError("로그인 정보를 다시 확인해주세요.");
      return;
    }

    if (!socketRef.current?.connected) {
      socketRef.current?.connect();
      setJoinError("서버에 다시 연결하고 있습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    joinSocketRoom();
  }

  function handleSignOut() {
    removeSessionStorageItem(browserStorageKeys.session.chat.lastNickname);
    signOut();
  }

  async function loginWithTestAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");

    const result = await signIn("credentials", {
      identifier: loginIdentifier,
      password: loginPassword,
      redirect: false
    });

    if (result?.error) {
      setLoginError("로그인 정보를 확인해주세요.");
    }
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();

    if (!text) {
      return;
    }

    socketRef.current?.emit("chat:message", { roomSlug, text }, (result: AckResult) => {
      if (result?.ok) {
        setDraft("");
      }
    });
  }

  return (
    <main className="appShell">
      <section className="chatPanel" aria-label="Chat room">
        <div className="appLayout">
          <AppMenu isAuthenticated={isAuthenticated} onSignOut={handleSignOut} />
          <div className="appMain">
            <header className="chatHeader">
              <h1 className="srOnly">{roomName || "Chat room"}</h1>
              <div className="headerActions">
                <div className="statusPill" aria-live="polite">
                  <span className="statusDot" />
                  <span>{visiblePresence.count} online</span>
                </div>
              </div>
            </header>

            {status === "loading" ? (
          <div className="authView">
            <p className="authTitle">로그인 상태를 확인하고 있습니다.</p>
          </div>
        ) : !isAuthenticated ? (
          <div className="authView">
            <div className="authContent">
              <p className="authTitle">Google 계정으로 로그인하세요.</p>
              <p className="authDescription">
                로그인 후 닉네임을 확인하고 채팅방에 입장할 수 있습니다.
              </p>
              <button type="button" onClick={() => signIn("google")}>
                Continue with Google
              </button>
              <div className="authDivider">or</div>
              <form className="localLoginForm" onSubmit={loginWithTestAccount}>
                <input
                  autoComplete="username"
                  placeholder="tester1 또는 tester1@wordrill.local"
                  value={loginIdentifier}
                  onChange={(event) => setLoginIdentifier(event.target.value)}
                />
                <input
                  autoComplete="current-password"
                  placeholder="password"
                  type="password"
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                />
                <button type="submit">Login with test account</button>
                {loginError ? <p className="authError">{loginError}</p> : null}
              </form>
            </div>
          </div>
        ) : !profileLoaded ? (
          <div className="authView">
            <p className="authTitle">프로필을 불러오고 있습니다.</p>
          </div>
        ) : !joined ? (
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
              {joinError ? <p className="authError">{joinError}</p> : null}
            </form>
          </div>
        ) : (
          <div className="roomView">
            <aside className="sidebar" aria-label="Room members">
              <p className="sidebarTitle">Members</p>
              <ul className="userList">
                {visiblePresence.users.map((user) => (
                  <li
                    key={user.id}
                    className={`${user.id === currentUserId ? "currentUser" : ""} ${
                      user.online ? "onlineUser" : "offlineUser"
                    }`}
                  >
                    <span className="userProfile">
                      <span className="userAvatar" aria-hidden="true">
                        {getUserInitial(user.nickname)}
                      </span>
                      <span className="userDetails">
                        <span className="userNickname">{user.nickname}</span>
                        <span className="userStatus">
                          <span className="userStatusDot" aria-hidden="true" />
                          {user.online ? "Online" : "Offline"}
                        </span>
                      </span>
                    </span>
                    {user.id === currentUserId ? <span className="youBadge">You</span> : null}
                  </li>
                ))}
              </ul>
            </aside>

            <section className="conversation" aria-label="Messages">
              <ol ref={messagesRef} className="messages" aria-live="polite">
                {messages.map((message, index) => {
                  const previousMessage = messages[index - 1];
                  const showDateDivider =
                    !previousMessage ||
                    getDateKey(previousMessage.createdAt) !== getDateKey(message.createdAt);

                  return (
                    <Fragment key={`${message.type}-${message.id}-${index}`}>
                      {showDateDivider ? (
                        <li className="dateDivider">
                          <time dateTime={getDateKey(message.createdAt)}>
                            {formatDateDivider(message.createdAt)}
                          </time>
                        </li>
                      ) : null}
                      {message.type === "system" ? (
                        <li className="message system">{message.text}</li>
                      ) : (
                        <li
                          className={`message ${message.userId === currentUserId ? "mine" : ""}`}
                        >
                          <div className="messageMeta">
                            <span className="messageAuthor">{message.nickname}</span>
                            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                          </div>
                          <div className="messageText">{message.text}</div>
                        </li>
                      )}
                    </Fragment>
                  );
                })}
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
          </div>
        </div>
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

function formatDateDivider(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full"
  }).format(new Date(value));
}

function getDateKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function normalizeNickname(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function getUserInitial(nickname: string) {
  return nickname.trim().charAt(0).toUpperCase() || "?";
}
