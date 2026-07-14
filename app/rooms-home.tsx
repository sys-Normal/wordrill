"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { Home, Settings2, Trash2 } from "lucide-react";
import type { Socket } from "socket.io-client";
import { createAuthenticatedSocket } from "../lib/authenticated-socket";
import {
  browserStorageKeys,
  removeSessionStorageItem
} from "../lib/browser-storage";
import {
  type RoomSummary,
  sortRoomSummaries
} from "../lib/room-summary-types";
import AppMenu from "./app-menu";

type RoomsHomeProps = {
  screen: "login" | "rooms";
};

type RecentAccount = {
  id: string;
  label: string;
};

export default function RoomsHome({ screen }: RoomsHomeProps) {
  const router = useRouter();
  const { status } = useSession();
  const roomEventVersionRef = useRef(0);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [editingRooms, setEditingRooms] = useState(false);
  const [createRoomModalOpen, setCreateRoomModalOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState("");
  const [roomError, setRoomError] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [recentLoginId, setRecentLoginId] = useState("");
  const [recentAccountToRemove, setRecentAccountToRemove] = useState<RecentAccount | null>(null);
  const [removingRecentAccount, setRemovingRecentAccount] = useState(false);
  const isAuthenticated = status === "authenticated";
  const filteredRooms = useMemo(() => {
    const query = roomSearch.trim().toLocaleLowerCase("ko-KR");

    if (!query) {
      return rooms;
    }

    return rooms.filter((room) => (
      room.name.toLocaleLowerCase("ko-KR").includes(query) ||
      room.lastMessage?.nickname.toLocaleLowerCase("ko-KR").includes(query) ||
      room.lastMessage?.text.toLocaleLowerCase("ko-KR").includes(query)
    ));
  }, [roomSearch, rooms]);

  const loadRooms = useCallback(async (showLoading = false) => {
    const eventVersionAtStart = roomEventVersionRef.current;

    if (showLoading) {
      setLoadingRooms(true);
    }
    setRoomError("");

    try {
      const response = await fetch("/api/rooms", { cache: "no-store" });

      if (!response.ok) {
        throw new Error("Failed to load rooms.");
      }

      const data = await response.json();
      const snapshot = sortRoomSummaries(data.rooms || []);

      setRooms((current) => (
        roomEventVersionRef.current === eventVersionAtStart
          ? snapshot
          : mergeRoomSnapshots(snapshot, current)
      ));
    } catch {
      setRoomError("채팅방 목록을 불러오지 못했습니다.");
    } finally {
      if (showLoading) {
        setLoadingRooms(false);
      }
    }
  }, []);

  useEffect(() => {
    if (status === "loading") {
      return;
    }

    if (screen === "login" && isAuthenticated) {
      router.replace("/rooms");
    } else if (screen === "rooms" && !isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router, screen, status]);

  useEffect(() => {
    if (!isAuthenticated || screen !== "rooms") {
      return;
    }

    void loadRooms(true);
  }, [isAuthenticated, loadRooms, screen]);

  useEffect(() => {
    if (!isAuthenticated || screen !== "rooms") {
      return;
    }

    const socket: Socket = createAuthenticatedSocket();
    let active = true;
    let hasConnected = false;

    function subscribeToRoomUpdates() {
      const isReconnect = hasConnected;
      hasConnected = true;

      socket.emit(
        "rooms:subscribe",
        {},
        (result: { ok?: boolean; error?: string }) => {
          if (!result?.ok && active) {
            setRoomError(result?.error || "채팅방 실시간 갱신을 연결하지 못했습니다.");
          }

          if (result?.ok && isReconnect) {
            void loadRooms();
          }
        }
      );
    }

    function handleRoomUpdated(room: RoomSummary) {
      if (!room?.id) {
        return;
      }

      roomEventVersionRef.current += 1;
      setRooms((current) => upsertRoomSummary(current, room));
    }

    function refreshVisibleRoomList() {
      if (document.visibilityState === "visible") {
        void loadRooms();
      }
    }

    socket.on("connect", subscribeToRoomUpdates);
    socket.on("connect_error", () => {
      if (active) {
        setRoomError("채팅방 실시간 갱신 인증에 실패했습니다.");
      }
    });
    socket.on("room:updated", handleRoomUpdated);
    socket.connect();
    document.addEventListener("visibilitychange", refreshVisibleRoomList);

    return () => {
      active = false;
      socket.off("connect", subscribeToRoomUpdates);
      socket.off("room:updated", handleRoomUpdated);
      socket.disconnect();
      document.removeEventListener("visibilitychange", refreshVisibleRoomList);
    };
  }, [isAuthenticated, loadRooms, screen]);

  useEffect(() => {
    if (screen !== "login" || status !== "unauthenticated") {
      return;
    }

    loadRecentAccounts();
  }, [screen, status]);

  useEffect(() => {
    if (!recentAccountToRemove || removingRecentAccount) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setRecentAccountToRemove(null);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [recentAccountToRemove, removingRecentAccount]);

  useEffect(() => {
    if (!createRoomModalOpen || creatingRoom) {
      return;
    }

    function closeCreateModalOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCreateRoomModalOpen(false);
        setCreateRoomError("");
      }
    }

    document.addEventListener("keydown", closeCreateModalOnEscape);
    return () => document.removeEventListener("keydown", closeCreateModalOnEscape);
  }, [createRoomModalOpen, creatingRoom]);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateRoomError("");
    setCreatingRoom(true);

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: roomName })
      });

      if (!response.ok) {
        throw new Error("Failed to create room.");
      }

      const data = await response.json();
      setRoomName("");
      setCreateRoomModalOpen(false);
      router.push(`/rooms/${data.room.id}`);
    } catch {
      setCreateRoomError("채팅방을 만들지 못했습니다.");
    } finally {
      setCreatingRoom(false);
    }
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
    } else {
      router.replace("/rooms");
    }
  }

  async function loginWithRecentAccount(account: RecentAccount) {
    setLoginError("");
    setRecentLoginId(account.id);

    try {
      const result = await signIn("credentials", {
        recentAccountId: account.id,
        redirect: false
      });

      if (result?.error) {
        setLoginError("최근 로그인 정보가 만료되었습니다. 다시 로그인해주세요.");
        await loadRecentAccounts();
        return;
      }

      router.replace("/rooms");
    } finally {
      setRecentLoginId("");
    }
  }

  async function loadRecentAccounts() {
    try {
      const response = await fetch("/api/auth/recent-login", { cache: "no-store" });

      if (!response.ok) {
        setRecentAccounts([]);
        return;
      }

      const data = await response.json();
      setRecentAccounts(data.presets || []);
    } catch {
      setRecentAccounts([]);
    }
  }

  async function removeRecentAccount() {
    if (!recentAccountToRemove) {
      return;
    }

    setRemovingRecentAccount(true);
    setLoginError("");

    try {
      const response = await fetch("/api/auth/recent-login", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetId: recentAccountToRemove.id })
      });

      if (!response.ok) {
        throw new Error("Failed to remove recent account.");
      }

      setRecentAccounts((accounts) =>
        accounts.filter((account) => account.id !== recentAccountToRemove.id)
      );
      setRecentAccountToRemove(null);
    } catch {
      setLoginError("최근 로그인 계정을 제거하지 못했습니다.");
    } finally {
      setRemovingRecentAccount(false);
    }
  }

  async function handleSignOut() {
    removeSessionStorageItem(browserStorageKeys.session.chat.lastNickname);
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="appShell">
      <section className="chatPanel roomsPanel" aria-label="My chat rooms">
        <div className="appLayout">
          <AppMenu isAuthenticated={isAuthenticated} onSignOut={handleSignOut} />
          <div className="appMain">
            {screen === "login" ? (
              <Link
                aria-label="홈으로"
                className="loginBackButton secondaryButton textButton"
                href="/"
                title="홈으로"
              >
                <Home aria-hidden="true" size={20} />
              </Link>
            ) : null}
            <h1 className="srOnly">My rooms</h1>

            {status === "loading" || (screen === "login" && isAuthenticated) || (screen === "rooms" && !isAuthenticated) ? (
          <div className="authView">
            <p className="authTitle">로그인 상태를 확인하고 있습니다.</p>
          </div>
        ) : screen === "login" ? (
          <div className="authView">
            <div className="authContent">
              <p className="authTitle">Google 계정으로 로그인하세요.</p>
              <p className="authDescription">
                로그인 후 내가 속한 채팅방을 확인할 수 있습니다.
              </p>
              <button type="button" onClick={() => signIn("google", { redirectTo: "/rooms" })}>
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
              {recentAccounts.length ? (
                <>
                  <div className="authDivider">recent</div>
                  <div className="recentAccountList" aria-label="최근 로그인 계정">
                    {recentAccounts.map((account) => (
                      <div className="recentAccountRow" key={account.id}>
                        <button
                          className="recentAccountButton secondaryButton"
                          disabled={Boolean(recentLoginId)}
                          onClick={() => loginWithRecentAccount(account)}
                          title={account.label}
                          type="button"
                        >
                          <span>{account.label}</span>
                        </button>
                        <button
                          aria-label={`${account.label} 최근 로그인에서 제거`}
                          className="recentAccountRemoveButton secondaryButton"
                          disabled={Boolean(recentLoginId)}
                          onClick={() => setRecentAccountToRemove(account)}
                          title="최근 로그인에서 제거"
                          type="button"
                        >
                          <Trash2 aria-hidden="true" size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="roomsView">
            <div className="roomToolbar">
              <input
                aria-label="채팅방 검색"
                placeholder="채팅방 검색"
                type="search"
                value={roomSearch}
                onChange={(event) => setRoomSearch(event.target.value)}
              />
              <button
                aria-pressed={editingRooms}
                className={editingRooms ? "secondaryButton activeToolbarButton" : "secondaryButton"}
                onClick={() => setEditingRooms((current) => !current)}
                type="button"
              >
                Edit
              </button>
              <button
                onClick={() => {
                  setCreateRoomError("");
                  setCreateRoomModalOpen(true);
                }}
                type="button"
              >
                Create
              </button>
            </div>

            {roomError ? <p className="authError">{roomError}</p> : null}

            {loadingRooms ? (
              <p className="roomsStatus">채팅방 목록을 불러오고 있습니다.</p>
            ) : (
              filteredRooms.length ? (
              <ul className={`roomList ${editingRooms ? "editingRoomList" : ""}`}>
                {filteredRooms.map((room) => (
                  <li className="roomListItem" key={room.id}>
                    <Link className="roomLink" href={`/rooms/${room.id}`}>
                      <span className="roomAvatar" aria-hidden="true">
                        {getRoomInitial(room.name)}
                      </span>
                      <span className="roomSummary">
                        <span className="roomTopLine">
                          <strong>{room.name}</strong>
                          <time dateTime={room.lastMessage?.createdAt || room.updatedAt}>
                            {formatRoomTime(room.lastMessage?.createdAt || room.updatedAt)}
                          </time>
                        </span>
                        <span className="roomBottomLine">
                          <span className="roomLastMessage">
                            {formatLastMessage(room)}
                          </span>
                          {room.mentionCount > 0 || room.unreadCount > 0 ? (
                            <span className="roomBadges">
                              {room.mentionCount > 0 ? (
                                <span
                                  aria-label={`읽지 않은 멘션 ${room.mentionCount}개`}
                                  className="roomMentionBadge"
                                >
                                  @
                                </span>
                              ) : null}
                              {room.unreadCount > 0 ? (
                                <span
                                  aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}
                                  className="roomUnreadBadge"
                                >
                                  {room.unreadCount > 99 ? "99+" : room.unreadCount}
                                </span>
                              ) : null}
                            </span>
                          ) : null}
                        </span>
                      </span>
                    </Link>
                    {editingRooms ? (
                      <button
                        aria-label={`${room.name} 설정`}
                        className="roomEditAction secondaryButton"
                        disabled
                        title="채팅방별 설정은 기획 중입니다."
                        type="button"
                      >
                        <Settings2 aria-hidden="true" size={18} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              ) : (
                <p className="roomsStatus">검색 결과가 없습니다.</p>
              )
            )}
          </div>
            )}
          </div>
        </div>
      </section>
      {recentAccountToRemove ? (
        <div
          className="confirmModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !removingRecentAccount) {
              setRecentAccountToRemove(null);
            }
          }}
          role="presentation"
        >
          <section
            aria-describedby="remove-recent-account-description"
            aria-labelledby="remove-recent-account-title"
            aria-modal="true"
            className="confirmModal"
            role="dialog"
          >
            <h2 id="remove-recent-account-title">최근 로그인에서 제거할까요?</h2>
            <p id="remove-recent-account-description">
              <strong>{recentAccountToRemove.label}</strong> 계정의 빠른 로그인 정보가 이 기기에서 삭제됩니다.
            </p>
            <div className="confirmModalActions">
              <button
                autoFocus
                className="secondaryButton"
                disabled={removingRecentAccount}
                onClick={() => setRecentAccountToRemove(null)}
                type="button"
              >
                취소
              </button>
              <button
                className="dangerButton"
                disabled={removingRecentAccount}
                onClick={removeRecentAccount}
                type="button"
              >
                {removingRecentAccount ? "제거 중..." : "제거"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {createRoomModalOpen ? (
        <div
          className="confirmModalBackdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creatingRoom) {
              setCreateRoomModalOpen(false);
              setCreateRoomError("");
            }
          }}
          role="presentation"
        >
          <section
            aria-describedby="create-room-description"
            aria-labelledby="create-room-title"
            aria-modal="true"
            className="confirmModal roomCreateModal"
            role="dialog"
          >
            <h2 id="create-room-title">새 채팅방 만들기</h2>
            <p id="create-room-description">
              기본 정보를 입력하세요. 공개 범위와 참여 정책 등의 상세 설정은 기획 확정 후 이 화면에 추가됩니다.
            </p>
            <form className="roomCreateModalForm" onSubmit={createRoom}>
              <label htmlFor="new-room-name">채팅방 이름</label>
              <input
                autoFocus
                id="new-room-name"
                maxLength={40}
                placeholder="새 채팅방 이름"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
              />
              {createRoomError ? <p className="authError">{createRoomError}</p> : null}
              <div className="confirmModalActions">
                <button
                  className="secondaryButton"
                  disabled={creatingRoom}
                  onClick={() => {
                    setCreateRoomModalOpen(false);
                    setCreateRoomError("");
                  }}
                  type="button"
                >
                  취소
                </button>
                <button disabled={creatingRoom || !roomName.trim()} type="submit">
                  {creatingRoom ? "생성 중..." : "Create"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function getRoomInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "#";
}

function formatLastMessage(room: RoomSummary) {
  if (!room.lastMessage) {
    return "아직 메시지가 없습니다.";
  }

  return `${room.lastMessage.nickname}: ${room.lastMessage.text}`;
}

function formatRoomTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "numeric",
      minute: "2-digit"
    }).format(date);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function upsertRoomSummary(rooms: RoomSummary[], updatedRoom: RoomSummary) {
  const nextRooms = rooms.filter((room) => room.id !== updatedRoom.id);
  nextRooms.push(updatedRoom);
  return sortRoomSummaries(nextRooms);
}

function mergeRoomSnapshots(snapshot: RoomSummary[], liveRooms: RoomSummary[]) {
  const merged = new Map(snapshot.map((room) => [room.id, room]));

  for (const liveRoom of liveRooms) {
    const snapshotRoom = merged.get(liveRoom.id);

    if (!snapshotRoom || isRoomSummaryNewer(liveRoom, snapshotRoom)) {
      merged.set(liveRoom.id, liveRoom);
    }
  }

  return sortRoomSummaries(Array.from(merged.values()));
}

function isRoomSummaryNewer(left: RoomSummary, right: RoomSummary) {
  const leftTime = new Date(left.lastMessage?.createdAt || left.updatedAt).getTime();
  const rightTime = new Date(right.lastMessage?.createdAt || right.updatedAt).getTime();

  return leftTime > rightTime || left.messageCount > right.messageCount;
}
