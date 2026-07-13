"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Home } from "lucide-react";
import AppMenu from "../app-menu";

const GUEST_AUTH_ID_KEY = "wordrill.guest.auth-id";

const rooms = [
  { id: "guest-lounge", name: "Guest Lounge", description: "처음 만난 사람들과 가볍게 대화를 시작하는 공개 채팅방", people: 18 },
  { id: "daily-talk", name: "오늘의 이야기", description: "지금 하고 있는 일과 오늘의 기분을 나누는 공개 채팅방", people: 7 },
  { id: "music-share", name: "지금 듣는 음악", description: "좋아하는 음악을 추천하고 감상을 나누는 공개 채팅방", people: 12 }
];

export default function GuestPage() {
  const [guestAuthId, setGuestAuthId] = useState("");

  useEffect(() => {
    const existingId = window.sessionStorage.getItem(GUEST_AUTH_ID_KEY);
    const nextId = existingId || `guest_${crypto.randomUUID().slice(0, 8)}`;

    window.sessionStorage.setItem(GUEST_AUTH_ID_KEY, nextId);
    setGuestAuthId(nextId);
  }, []);

  return (
    <main className="appShell">
      <section className="chatPanel roomsPanel" aria-label="Guest public rooms">
        <div className="appLayout">
          <AppMenu isAuthenticated={false} />
          <div className="appMain">
            <Link
              aria-label="홈으로"
              className="loginBackButton secondaryButton textButton"
              href="/"
              title="홈으로"
            >
              <Home aria-hidden="true" size={20} />
            </Link>
            <h1 className="srOnly">공개 채팅방</h1>
            <div className="roomsView">
              <div className="guestNotice">
                <span className="guestNoticeTopLine">
                  <strong>게스트 체험 모드</strong>
                  <span className="guestIdentity">{guestAuthId || "guest 발급 중"}</span>
                </span>
                <span>아래 공개 채팅방은 UI 프로토타입이며 실제 입장은 다음 단계에서 연결됩니다.</span>
              </div>
              <ul className="roomList">
                {rooms.map((room) => (
                  <li key={room.id}>
                    <div className="roomLink guestRoomLink">
                      <span className="roomAvatar" aria-hidden="true">
                        {room.name.trim().charAt(0).toUpperCase() || "#"}
                      </span>
                      <span className="roomSummary">
                        <span className="roomTopLine">
                          <strong>{room.name}</strong>
                          <span className="guestRoomPeople">{room.people}명 접속 중</span>
                        </span>
                        <span className="roomLastMessage">{room.description}</span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
