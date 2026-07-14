"use client";

import { signOut, useSession } from "next-auth/react";
import AppMenu from "../app-menu";
import { useOnlinePresence } from "../online-presence";
import {
  browserStorageKeys,
  removeSessionStorageItem
} from "../../lib/browser-storage";

export default function UsersPage() {
  const { data: session, status } = useSession();
  const { connected, count, users } = useOnlinePresence();

  async function handleSignOut() {
    removeSessionStorageItem(browserStorageKeys.session.chat.lastNickname);
    await signOut({ redirectTo: "/login" });
  }

  return (
    <main className="appShell">
      <section className="chatPanel" aria-label="Users">
        <div className="appLayout">
          <AppMenu
            isAuthenticated={status === "authenticated"}
            onSignOut={handleSignOut}
          />
          <div className="appMain">
            <div className="usersView">
              <header className="usersHeader">
                <div>
                  <h1>Users</h1>
                  <p>현재 Wordrill Chat에 접속 중인 사용자입니다.</p>
                </div>
                <span className="statusPill">
                  <span className="userStatusDot" aria-hidden="true" />
                  {connected ? `${count} online` : "연결 중"}
                </span>
              </header>

              {!connected ? (
                <p className="usersStatus">온라인 상태를 확인하고 있습니다.</p>
              ) : users.length === 0 ? (
                <p className="usersStatus">현재 접속 중인 사용자가 없습니다.</p>
              ) : (
                <ul className="onlineUsersList">
                  {users.map((user) => {
                    const isCurrentUser = user.id === session?.user?.id;

                    return (
                      <li className={isCurrentUser ? "currentUser" : ""} key={user.id}>
                        <div className="userProfile">
                          <span className="userAvatar" aria-hidden="true">
                            {user.nickname.slice(0, 1).toUpperCase()}
                          </span>
                          <span className="userDetails">
                            <span className="userNickname">{user.nickname}</span>
                            <span className="userStatus">
                              <span className="userStatusDot" aria-hidden="true" />
                              Online
                            </span>
                          </span>
                        </div>
                        {isCurrentUser ? <span className="youBadge">You</span> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
