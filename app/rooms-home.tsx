"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  browserStorageKeys,
  removeSessionStorageItem
} from "../lib/browser-storage";
import ThemeToggle from "./theme-toggle";

type Room = {
  id: string;
  lastMessage: {
    createdAt: string;
    nickname: string;
    text: string;
  } | null;
  messageCount: number;
  name: string;
  slug: string;
  updatedAt: string;
};

export default function RoomsHome() {
  const router = useRouter();
  const { status } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const isAuthenticated = status === "authenticated";

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    setLoadingRooms(true);
    setRoomError("");

    fetch("/api/rooms")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to load rooms.");
        }

        return response.json();
      })
      .then((data) => setRooms(data.rooms || []))
      .catch(() => setRoomError("채팅방 목록을 불러오지 못했습니다."))
      .finally(() => setLoadingRooms(false));
  }, [isAuthenticated]);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRoomError("");
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
      router.push(`/rooms/${data.room.slug}`);
    } catch {
      setRoomError("채팅방을 만들지 못했습니다.");
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
    }
  }

  function handleSignOut() {
    removeSessionStorageItem(browserStorageKeys.session.chat.lastNickname);
    signOut();
  }

  return (
    <main className="appShell">
      <section className="chatPanel roomsPanel" aria-label="My chat rooms">
        <header className="chatHeader">
          <div>
            <p className="eyebrow">Wordrill Chat</p>
            <h1>My rooms</h1>
          </div>
          <div className="headerActions">
            <ThemeToggle />
            {isAuthenticated ? (
              <>
              <Link className="secondaryButton textButton" href="/settings">
                Settings
              </Link>
              <button className="secondaryButton" type="button" onClick={handleSignOut}>
                Logout
              </button>
              </>
            ) : null}
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
                로그인 후 내가 속한 채팅방을 확인할 수 있습니다.
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
        ) : (
          <div className="roomsView">
            <form className="roomCreateForm" onSubmit={createRoom}>
              <input
                maxLength={40}
                placeholder="새 채팅방 이름"
                value={roomName}
                onChange={(event) => setRoomName(event.target.value)}
              />
              <button type="submit" disabled={creatingRoom || !roomName.trim()}>
                Create
              </button>
            </form>

            {roomError ? <p className="authError">{roomError}</p> : null}

            {loadingRooms ? (
              <p className="roomsStatus">채팅방 목록을 불러오고 있습니다.</p>
            ) : (
              <ul className="roomList">
                {rooms.map((room) => (
                  <li key={room.id}>
                    <Link className="roomLink" href={`/rooms/${room.slug}`}>
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
                        <span className="roomLastMessage">
                          {formatLastMessage(room)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function getRoomInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "#";
}

function formatLastMessage(room: Room) {
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
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}
