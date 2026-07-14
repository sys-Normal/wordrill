"use client";

import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import type { Socket } from "socket.io-client";
import { createAuthenticatedSocket } from "../../../lib/authenticated-socket";
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
  sequence: string;
  userId: string;
  nickname: string;
  text: string;
  createdAt: string;
  mentions: MessageMentionRange[];
  unreadCount: number;
};

type MessageMentionRange = {
  end: number;
  label: string;
  start: number;
  userId: string;
};

type Message = { type: "chat" } & ChatMessage;

type ChatHistoryPayload = {
  cursor: string | null;
  hasMore: boolean;
  lastReadAt: string | null;
  lastReadSequence: string | null;
  messages: ChatMessage[];
};

type ReadCountUpdate = {
  id: string;
  unreadCount: number;
};

type Presence = {
  count: number;
  users: User[];
};

type AckResult = {
  ok: boolean;
  error?: string;
  messageId?: string;
  nickname?: string;
  room?: {
    id: string;
    name: string;
    slug: string;
  };
};

type HistoryAckResult = AckResult & Partial<Pick<
  ChatHistoryPayload,
  "cursor" | "hasMore" | "messages"
>>;

type RoomChatProps = {
  initialRoom: {
    id: string;
    name: string;
  };
};

export default function RoomChat({ initialRoom }: RoomChatProps) {
  const roomId = initialRoom.id;
  const { data: session, status } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const messagesRef = useRef<HTMLOListElement | null>(null);
  const hasInitialScrollRef = useRef(false);
  const initialLastReadAtRef = useRef<string | null>(null);
  const initialLastReadSequenceRef = useRef<string | null>(null);
  const pendingInitialScrollRef = useRef(false);
  const pendingAutoScrollRef = useRef(false);
  const pendingHistoryPrependRef = useRef<{ height: number; top: number } | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const [roomName, setRoomName] = useState(initialRoom.name);
  const [nickname, setNickname] = useState("");
  const [draft, setDraft] = useState("");
  const [mentionSearch, setMentionSearch] = useState<{
    end: number;
    query: string;
    start: number;
  } | null>(null);
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const [selectedMentionUsers, setSelectedMentionUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [presence, setPresence] = useState<Presence>({ count: 0, users: [] });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [joinError, setJoinError] = useState("");
  const [messageSending, setMessageSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const isAuthenticated = status === "authenticated";
  const sessionName = session?.user?.name || session?.user?.email || "";

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
      count: users.filter((user) => user.online).length,
      users
    };
  }, [presence]);
  const mentionCandidates = useMemo(() => {
    if (!mentionSearch) {
      return [];
    }

    const query = mentionSearch.query.toLocaleLowerCase("ko-KR");

    return visiblePresence.users
      .filter((user) => (
        user.id !== currentUserId &&
        user.nickname.toLocaleLowerCase("ko-KR").includes(query)
      ))
      .slice(0, 8);
  }, [currentUserId, mentionSearch, visiblePresence.users]);

  useEffect(() => {
    setMentionActiveIndex(0);
  }, [mentionSearch?.query]);

  const socket = useMemo<Socket | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return createAuthenticatedSocket();
  }, []);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleConnect = () => {
      setSocketConnected(true);
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
      setJoined(false);
      setPresence({ count: 0, users: [] });
    };

    const handleUserReady = (user: User) => {
      setCurrentUserId(user.id);
    };

    const handleChatHistory = (history: ChatHistoryPayload | ChatMessage[]) => {
      const nextMessages = Array.isArray(history) ? history : history.messages;
      initialLastReadAtRef.current = Array.isArray(history) ? null : history.lastReadAt;
      initialLastReadSequenceRef.current = Array.isArray(history)
        ? null
        : history.lastReadSequence;
      setHistoryCursor(Array.isArray(history) ? null : history.cursor);
      setHistoryHasMore(Array.isArray(history) ? false : history.hasMore);
      setHistoryError("");
      pendingInitialScrollRef.current = true;
      hasInitialScrollRef.current = false;
      pendingAutoScrollRef.current = false;
      setMessages(nextMessages.map((message) => ({ type: "chat", ...message })));
    };

    const handleChatMessage = (message: ChatMessage) => {
      setMessages((current) => {
        if (current.some((item) => item.type === "chat" && item.id === message.id)) {
          return current;
        }

        prepareForIncomingMessage();
        return [...current, { type: "chat" as const, ...message }].sort(compareMessageSequence);
      });
    };

    const handleReadCountUpdate = (updates: ReadCountUpdate[]) => {
      const counts = new Map(updates.map((update) => [update.id, update.unreadCount]));

      setMessages((current) => current.map((message) => ({
        ...message,
        unreadCount: counts.get(message.id) ?? message.unreadCount
      })));
    };

    const handlePresenceUpdate = (nextPresence: Presence) => {
      setPresence(nextPresence);
    };

    socketRef.current = socket;
    socket.on("connect", handleConnect);
    socket.on("connect_error", () => {
      setSocketConnected(false);
      setJoined(false);
      setJoinError("실시간 서버 인증에 실패했습니다. 로그인 상태를 다시 확인해주세요.");
    });
    socket.on("disconnect", handleDisconnect);
    socket.on("user:ready", handleUserReady);
    socket.on("chat:history", handleChatHistory);
    socket.on("chat:message", handleChatMessage);
    socket.on("message:read:update", handleReadCountUpdate);
    socket.on("presence:update", handlePresenceUpdate);
    socket.connect();

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("user:ready", handleUserReady);
      socket.off("chat:history", handleChatHistory);
      socket.off("chat:message", handleChatMessage);
      socket.off("message:read:update", handleReadCountUpdate);
      socket.off("presence:update", handlePresenceUpdate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [socket]);

  useEffect(() => {
    const container = messagesRef.current;

    if (!container) {
      return;
    }

    const prependPosition = pendingHistoryPrependRef.current;

    if (prependPosition) {
      const frameId = window.requestAnimationFrame(() => {
        container.scrollTop = prependPosition.top + container.scrollHeight - prependPosition.height;
        pendingHistoryPrependRef.current = null;
      });

      return () => window.cancelAnimationFrame(frameId);
    }

    if (!hasInitialScrollRef.current && pendingInitialScrollRef.current) {
      const targetMessageId = findInitialReadPosition(
        messages,
        initialLastReadSequenceRef.current,
        initialLastReadAtRef.current
      );
      const frameId = window.requestAnimationFrame(() => {
        if (targetMessageId) {
          const targetElement = Array.from(
            container.querySelectorAll<HTMLElement>("[data-message-id]")
          ).find((element) => element.dataset.messageId === targetMessageId);

          if (targetElement) {
            container.scrollTo({
              top: Math.max(0, targetElement.offsetTop - container.offsetTop - 8),
              behavior: "auto"
            });
            shouldStickToBottomRef.current = false;
          }
        } else {
          container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
          shouldStickToBottomRef.current = true;
        }

        hasInitialScrollRef.current = true;
        pendingInitialScrollRef.current = false;
        pendingAutoScrollRef.current = false;
      });

      return () => window.cancelAnimationFrame(frameId);
    }

    if (!pendingAutoScrollRef.current && !shouldStickToBottomRef.current) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "auto"
      });
      hasInitialScrollRef.current = true;
      pendingAutoScrollRef.current = false;
      shouldStickToBottomRef.current = true;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [messages]);

  useEffect(() => {
    const latestMessage = messages[messages.length - 1];

    if (
      !joined ||
      !latestMessage ||
      !shouldStickToBottomRef.current ||
      document.visibilityState !== "visible"
    ) {
      return;
    }

    const markLatestMessageRead = () => {
      if (
        document.visibilityState === "visible" &&
        shouldStickToBottomRef.current
      ) {
        socketRef.current?.emit("message:read", { messageId: latestMessage.id });
      }
    };
    const frameId = window.requestAnimationFrame(markLatestMessageRead);

    document.addEventListener("visibilitychange", markLatestMessageRead);

    return () => {
      window.cancelAnimationFrame(frameId);
      document.removeEventListener("visibilitychange", markLatestMessageRead);
    };
  }, [joined, messages]);

  function handleMessagesScroll() {
    const container = messagesRef.current;

    if (!container) {
      return;
    }

    if (!hasInitialScrollRef.current) {
      return;
    }

    if (pendingAutoScrollRef.current) {
      return;
    }

    shouldStickToBottomRef.current = isNearScrollBottom(container);

    if (shouldStickToBottomRef.current && joined) {
      const latestMessage = messages[messages.length - 1];

      if (latestMessage && document.visibilityState === "visible") {
        socketRef.current?.emit("message:read", { messageId: latestMessage.id });
      }
    }
  }

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    setProfileLoaded(false);
    setJoinError("");
    fetch("/api/profile")
      .then((response) => response.json())
      .then((data) => {
        const savedNickname = normalizeNickname(data.user?.nickname);
        const storedNickname = normalizeNickname(
          getSessionStorageItem(browserStorageKeys.session.chat.lastNickname)
        );
        const fallbackNickname = normalizeNickname(sessionName);
        const nextNickname = savedNickname || storedNickname || fallbackNickname;

        if (nextNickname) {
          setNickname(nextNickname);
        }

      })
      .catch(() => undefined)
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
      !roomId
    ) {
      return;
    }

    joinSocketRoom();
  }, [
    isAuthenticated,
    joined,
    nickname,
    profileLoaded,
    roomId,
    socket,
    socketConnected
  ]);

  async function joinSocketRoom() {
    try {
      const response = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/join`, {
        method: "POST"
      });

      if (!response.ok) {
        setJoinError(
          response.status === 404
            ? "존재하지 않는 채팅방입니다."
            : "채팅방 참여 정보를 등록하지 못했습니다."
        );
        return;
      }

      const data = await response.json();
      const joinedRoomId = String(data.room?.id || roomId);
      setRoomName(data.room?.name || "Chat room");

      socketRef.current?.emit("user:join", {
        nickname,
        roomId: joinedRoomId
      }, (result: AckResult) => {
        if (result?.ok) {
          setSessionStorageItem(
            browserStorageKeys.session.chat.lastNickname,
            result.nickname || nickname
          );
          setRoomName(result.room?.name || data.room?.name || "Chat room");
          setJoinError("");
          setJoined(true);
        } else {
          setJoinError(result?.error || "채팅방에 입장하지 못했습니다.");
        }
      });
    } catch {
      setJoinError("채팅방 참여 정보를 등록하지 못했습니다.");
    }
  }

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJoinError("");

    if (!socketRef.current?.connected) {
      socketRef.current?.connect();
      setJoinError("서버에 다시 연결하고 있습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    joinSocketRoom();
  }

  async function handleSignOut() {
    removeSessionStorageItem(browserStorageKeys.session.chat.lastNickname);
    await signOut({ redirectTo: "/login" });
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

  function loadOlderMessages() {
    const socket = socketRef.current;
    const container = messagesRef.current;

    if (!socket?.connected || !historyCursor || historyLoading) {
      return;
    }

    setHistoryLoading(true);
    setHistoryError("");
    pendingHistoryPrependRef.current = container
      ? { height: container.scrollHeight, top: container.scrollTop }
      : null;

    socket.timeout(5000).emit(
      "chat:history:before",
      { cursor: historyCursor },
      (error: Error | null, result?: HistoryAckResult) => {
        setHistoryLoading(false);

        if (error || !result?.ok || !result.messages) {
          pendingHistoryPrependRef.current = null;
          setHistoryError(result?.error || "이전 메시지를 불러오지 못했습니다.");
          return;
        }

        setHistoryCursor(result.cursor || null);
        setHistoryHasMore(Boolean(result.hasMore));
        setMessages((current) => {
          const currentIds = new Set(current.map((message) => message.id));
          const olderMessages = result.messages
            ?.filter((message) => !currentIds.has(message.id))
            .map((message) => ({ type: "chat" as const, ...message })) || [];
          if (olderMessages.length === 0) {
            pendingHistoryPrependRef.current = null;
            return current;
          }

          return [...olderMessages, ...current].sort(compareMessageSequence);
        });
      }
    );
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();

    if (!text || messageSending) {
      return;
    }

    prepareForIncomingMessage();
    const mentions = buildMentionRanges(text, selectedMentionUsers);
    const socket = socketRef.current;

    if (!socket?.connected) {
      setSendError("서버 연결을 확인한 뒤 다시 시도해주세요.");
      return;
    }

    setMessageSending(true);
    setSendError("");

    const result = await emitChatMessageWithRetry(socket, {
      clientMessageId: crypto.randomUUID(),
      mentions,
      roomId,
      text
    });

    setMessageSending(false);

    if (!result.ok) {
      setSendError(result.error || "메시지를 전송하지 못했습니다.");
      return;
    }

    setDraft("");
    setMentionSearch(null);
    setSelectedMentionUsers([]);
  }

  function updateDraft(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    const cursor = event.currentTarget.selectionStart ?? value.length;
    setDraft(value);
    setSelectedMentionUsers((users) => (
      users.filter((user) => value.includes(`@${user.nickname}`))
    ));
    updateMentionSearch(value, cursor);
  }

  function updateMentionSearch(value: string, cursor: number) {
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/u);

    if (!match) {
      setMentionSearch(null);
      return;
    }

    const start = beforeCursor.lastIndexOf("@");
    setMentionSearch({ end: cursor, query: match[1], start });
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!mentionSearch || mentionCandidates.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMentionActiveIndex((index) => (index + 1) % mentionCandidates.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setMentionActiveIndex((index) => (
        (index - 1 + mentionCandidates.length) % mentionCandidates.length
      ));
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectMention(mentionCandidates[mentionActiveIndex] || mentionCandidates[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setMentionSearch(null);
    }
  }

  function selectMention(user: User) {
    if (!mentionSearch) {
      return;
    }

    const mentionText = `@${user.nickname}`;
    const nextDraft = `${draft.slice(0, mentionSearch.start)}${mentionText} ${draft.slice(mentionSearch.end)}`;
    const nextCursor = mentionSearch.start + mentionText.length + 1;
    setDraft(nextDraft);
    setMentionSearch(null);
    setSelectedMentionUsers((users) => (
      users.some((current) => current.id === user.id)
        ? users
        : [...users, user]
    ));

    window.requestAnimationFrame(() => {
      draftInputRef.current?.focus();
      draftInputRef.current?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function prepareForIncomingMessage() {
    const container = messagesRef.current;

    pendingAutoScrollRef.current = Boolean(
      shouldStickToBottomRef.current ||
      (container && isNearScrollBottom(container))
    );
  }

  return (
    <main className="appShell">
      <section className="chatPanel" aria-label="Chat room">
        <div className="appLayout">
          <AppMenu isAuthenticated={isAuthenticated} onSignOut={handleSignOut} />
          <div className="appMain">
            <header className="chatHeader">
              <div className="roomHeaderIdentity">
                <Link
                  aria-label="채팅방 목록으로"
                  className="roomBackLink"
                  href="/rooms"
                  title="채팅방 목록으로"
                >
                  <ArrowLeft aria-hidden="true" size={22} />
                </Link>
                <h1 className="roomHeaderTitle">{roomName || "채팅방"}</h1>
              </div>
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
              <ol
                ref={messagesRef}
                className="messages"
                aria-live="polite"
                onScroll={handleMessagesScroll}
              >
                {historyHasMore ? (
                  <li className="historyLoader">
                    <button disabled={historyLoading} onClick={loadOlderMessages} type="button">
                      {historyLoading ? "불러오는 중…" : "이전 메시지 불러오기"}
                    </button>
                    {historyError ? <span>{historyError}</span> : null}
                  </li>
                ) : null}
                {messages.map((message, index) => {
                  const previousMessage = messages[index - 1];
                  const showDateDivider =
                    !previousMessage ||
                    getDateKey(previousMessage.createdAt) !== getDateKey(message.createdAt);

                  return (
                    <Fragment key={`${message.id}-${index}`}>
                      {showDateDivider ? (
                        <li className="dateDivider">
                          <time dateTime={getDateKey(message.createdAt)}>
                            {formatDateDivider(message.createdAt)}
                          </time>
                        </li>
                      ) : null}
                      <li
                        className={`message ${message.userId === currentUserId ? "mine" : ""}`}
                        data-message-id={message.id}
                      >
                        <div className="messageBubble">
                          <div className="messageMeta">
                            <span className="messageAuthor">{message.nickname}</span>
                            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                          </div>
                          <div className="messageText">{renderMessageText(message)}</div>
                        </div>
                        {message.unreadCount > 0 ? (
                          <span
                            aria-label={`${message.unreadCount}명이 아직 읽지 않음`}
                            className="messageUnreadCount"
                          >
                            {message.unreadCount}
                          </span>
                        ) : null}
                      </li>
                    </Fragment>
                  );
                })}
              </ol>

              <form className="messageForm" onSubmit={sendMessage}>
                <div className="messageComposer">
                  {mentionSearch && mentionCandidates.length > 0 ? (
                    <ul className="mentionSuggestions" role="listbox">
                      {mentionCandidates.map((user, index) => (
                        <li key={user.id}>
                          <button
                            aria-selected={index === mentionActiveIndex}
                            className={index === mentionActiveIndex ? "activeMentionSuggestion" : ""}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectMention(user)}
                            role="option"
                            type="button"
                          >
                            <span className="userAvatar" aria-hidden="true">
                              {getUserInitial(user.nickname)}
                            </span>
                            <span>{user.nickname}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <input
                    ref={draftInputRef}
                    maxLength={500}
                    autoComplete="off"
                    placeholder="메시지를 입력하세요 (@로 멘션)"
                    disabled={messageSending}
                    value={draft}
                    onChange={updateDraft}
                    onClick={(event) => updateMentionSearch(
                      event.currentTarget.value,
                      event.currentTarget.selectionStart ?? event.currentTarget.value.length
                    )}
                    onKeyDown={handleDraftKeyDown}
                  />
                </div>
                <button disabled={messageSending} type="submit">
                  {messageSending ? "Sending…" : "Send"}
                </button>
              </form>
              {sendError ? <p className="messageSendError">{sendError}</p> : null}
            </section>
          </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

async function emitChatMessageWithRetry(
  socket: Socket,
  payload: {
    clientMessageId: string;
    mentions: MessageMentionRange[];
    roomId: string;
    text: string;
  }
) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptResult = await new Promise<{
      result: AckResult;
      timedOut: boolean;
    }>((resolve) => {
      socket.timeout(5000).emit(
        "chat:message",
        payload,
        (error: Error | null, ack?: AckResult) => {
          resolve({
            result: error
              ? { ok: false, error: "메시지 저장 확인 시간이 초과되었습니다." }
              : ack || { ok: false, error: "메시지 저장 결과가 없습니다." },
            timedOut: Boolean(error)
          });
        }
      );
    });

    if (!attemptResult.timedOut || attempt === maxAttempts) {
      return attemptResult.result;
    }
  }

  return { ok: false, error: "메시지를 전송하지 못했습니다." };
}

function buildMentionRanges(text: string, users: User[]): MessageMentionRange[] {
  const ranges: MessageMentionRange[] = [];

  for (const user of [...users].sort((left, right) => right.nickname.length - left.nickname.length)) {
    const token = `@${user.nickname}`;
    let start = text.indexOf(token);

    while (start !== -1) {
      ranges.push({
        end: start + token.length,
        label: user.nickname,
        start,
        userId: user.id
      });
      start = text.indexOf(token, start + token.length);
    }
  }

  const sorted = ranges.sort((left, right) => left.start - right.start || right.end - left.end);
  const nonOverlapping: MessageMentionRange[] = [];

  for (const range of sorted) {
    const previous = nonOverlapping[nonOverlapping.length - 1];

    if (!previous || range.start >= previous.end) {
      nonOverlapping.push(range);
    }
  }

  return nonOverlapping.slice(0, 20);
}

function renderMessageText(message: Message) {
  const mentions = (message.mentions || [])
    .filter((mention) => (
      mention.start >= 0 &&
      mention.end <= message.text.length &&
      mention.end > mention.start &&
      message.text.slice(mention.start, mention.end) === `@${mention.label}`
    ))
    .sort((left, right) => left.start - right.start);

  if (mentions.length === 0) {
    return message.text;
  }

  const parts = [];
  let cursor = 0;

  for (const mention of mentions) {
    if (mention.start < cursor) {
      continue;
    }

    if (mention.start > cursor) {
      parts.push(message.text.slice(cursor, mention.start));
    }

    parts.push(
      <span className="messageMention" key={`${mention.userId}-${mention.start}`}>
        {message.text.slice(mention.start, mention.end)}
      </span>
    );
    cursor = mention.end;
  }

  if (cursor < message.text.length) {
    parts.push(message.text.slice(cursor));
  }

  return parts;
}

function findInitialReadPosition(
  messages: Message[],
  lastReadSequence: string | null,
  lastReadAt: string | null
) {
  if ((!lastReadSequence && !lastReadAt) || messages.length === 0) {
    return null;
  }

  if (lastReadSequence) {
    const readSequence = BigInt(lastReadSequence);
    const latestSequence = BigInt(messages[messages.length - 1].sequence);

    if (readSequence >= latestSequence) {
      return null;
    }

    let lastReadIndex = -1;

    for (let index = 0; index < messages.length; index += 1) {
      if (BigInt(messages[index].sequence) <= readSequence) {
        lastReadIndex = index;
      } else {
        break;
      }
    }

    return messages[Math.max(0, lastReadIndex)].id;
  }

  const lastReadTime = new Date(lastReadAt || 0).getTime();
  const latestMessageTime = new Date(messages[messages.length - 1].createdAt).getTime();

  if (lastReadTime >= latestMessageTime) {
    return null;
  }

  let lastReadIndex = -1;

  for (let index = 0; index < messages.length; index += 1) {
    if (new Date(messages[index].createdAt).getTime() > lastReadTime) {
      break;
    }

    lastReadIndex = index;
  }

  return messages[Math.max(0, lastReadIndex)].id;
}

function compareMessageSequence(left: Message, right: Message) {
  const leftSequence = BigInt(left.sequence);
  const rightSequence = BigInt(right.sequence);
  return leftSequence < rightSequence ? -1 : leftSequence > rightSequence ? 1 : 0;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
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

function isNearScrollBottom(element: HTMLElement) {
  const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceFromBottom <= 72;
}
