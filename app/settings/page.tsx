"use client";

import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

type Profile = {
  email?: string | null;
  name?: string | null;
  nickname?: string | null;
};

export default function SettingsPage() {
  const { status } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    fetch("/api/profile")
      .then((response) => response.json())
      .then((data) => {
        setProfile(data.user);
        setNickname(data.user?.nickname || "");
      })
      .catch(() => setMessage("프로필을 불러오지 못했습니다."));
  }, [status]);

  async function saveNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname })
      });

      if (!response.ok) {
        throw new Error("Failed to save profile.");
      }

      const data = await response.json();
      setProfile(data.user);
      setNickname(data.user?.nickname || "");
      setMessage("저장되었습니다.");
    } catch {
      setMessage("저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="settingsShell">
      <section className="settingsPanel" aria-label="Settings">
        <header className="settingsHeader">
          <div>
            <p className="eyebrow">Account settings</p>
            <h1>Settings</h1>
          </div>
          <Link className="textButton" href="/">
            Back to rooms
          </Link>
        </header>

        {status === "loading" ? (
          <p className="settingsStatus">로그인 상태를 확인하고 있습니다.</p>
        ) : status !== "authenticated" ? (
          <p className="settingsStatus">로그인이 필요합니다.</p>
        ) : (
          <form className="settingsForm" onSubmit={saveNickname}>
            <div>
              <label htmlFor="nickname">Nickname</label>
              <input
                id="nickname"
                maxLength={24}
                required
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
              />
            </div>
            <p className="settingsMeta">{profile?.email || profile?.name}</p>
            <div className="settingsActions">
              <button type="submit" disabled={saving}>
                {saving ? "Saving" : "Save"}
              </button>
              {message ? <span className="settingsMessage">{message}</span> : null}
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
