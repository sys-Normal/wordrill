"use client";

import Link from "next/link";
import { LogIn, MessagesSquare } from "lucide-react";
import ThemeToggle from "./theme-toggle";

export default function EntryHome() {
  return (
    <main className="entryShell">
      <div className="entryThemeToggle">
        <ThemeToggle />
      </div>
      <section className="entryContent" aria-labelledby="entry-title">
        <p className="entryEyebrow">Wordrill Chat</p>
        <h1 id="entry-title">어떻게 시작할까요?</h1>
        <p className="entryDescription">
          계정 없이 공개 채팅을 둘러보거나, 로그인해서 내 채팅방을 이어가세요.
        </p>
        <div className="entryChoices">
          <Link className="entryChoice guestChoice" href="/guest">
            <span className="entryChoiceIcon" aria-hidden="true">
              <MessagesSquare size={26} strokeWidth={2.2} />
            </span>
            <span className="entryChoiceTitle">Guest로 체험하기</span>
            <span className="entryChoiceDescription">가입 없이 바로 공개 채팅방 둘러보기</span>
          </Link>
          <Link className="entryChoice loginChoice" href="/login">
            <span className="entryChoiceIcon" aria-hidden="true">
              <LogIn size={26} strokeWidth={2.2} />
            </span>
            <span className="entryChoiceTitle">로그인하기</span>
            <span className="entryChoiceDescription">내 채팅방과 대화를 이어서 사용하기</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
