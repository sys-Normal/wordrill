"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ThemeToggle from "../theme-toggle";

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
    <main className="guestPrototypeShell">
      <header className="guestPrototypeHeader">
        <Link className="secondaryButton textButton" href="/">돌아가기</Link>
        <div>
          <p className="entryEyebrow">Guest Preview</p>
          <h1>공개 채팅방</h1>
        </div>
        <ThemeToggle />
        <span className="guestIdentity">{guestAuthId || "guest 발급 중"}</span>
      </header>
      <section className="guestPrototypeContent" aria-label="Guest public rooms">
        <div className="guestNotice">
          <strong>게스트 체험 모드</strong>
          <span>임시 Auth ID가 발급되었습니다. 아래 방은 UI 프로토타입이며 실제 입장은 다음 단계에서 연결됩니다.</span>
        </div>
        <div className="guestRoomGrid">
          {rooms.map((room) => (
            <article className="guestRoomCard" key={room.id}>
              <span className="roomAvatar" aria-hidden="true">{room.name.trim().charAt(0).toUpperCase() || "#"}</span>
              <div className="guestRoomInfo">
                <div className="guestRoomTitleLine">
                  <h2>{room.name}</h2>
                  <span>{room.people}명 접속 중</span>
                </div>
                <p>{room.description}</p>
                <button type="button" disabled>곧 입장 가능</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
