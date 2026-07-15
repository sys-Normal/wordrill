"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MessagesSquare, Settings, UsersRound } from "lucide-react";
import NavTestModeToggle from "./nav-test-mode-toggle";
import NavThemeToggle from "./nav-theme-toggle";

type AppMenuProps = {
  isAuthenticated: boolean;
  onSignOut?: () => void;
};

export default function AppMenu({ isAuthenticated, onSignOut }: AppMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const roomsActive = isCurrentRoute(pathname, "/rooms");
  const usersActive = isCurrentRoute(pathname, "/users");
  const guestActive = isCurrentRoute(pathname, "/guest");
  const settingsActive = isCurrentRoute(pathname, "/settings");

  return (
    <aside className={`appMenu ${open ? "menuOpen" : ""}`} aria-label="Main menu">
      <div className="menuHeader">
        <button
          aria-expanded={open}
          aria-label="Toggle menu"
          className="menuButton"
          type="button"
          onClick={() => setOpen((current) => !current)}
        >
          <span />
          <span />
          <span />
        </button>
        <span className="menuBrand">Wordrill Chat</span>
      </div>

      <nav className="menuPanel">
        <div className="menuTop">
          {isAuthenticated ? (
            <>
              <Link
                aria-current={roomsActive ? "page" : undefined}
                aria-label="Rooms"
                className={getMenuLinkClassName(roomsActive)}
                href="/rooms"
                title="Rooms"
              >
                <MessagesSquare aria-hidden="true" size={20} />
                <span className="menuLabel">Rooms</span>
              </Link>
              <Link
                aria-current={usersActive ? "page" : undefined}
                aria-label="Users"
                className={getMenuLinkClassName(usersActive)}
                href="/users"
                title="Users"
              >
                <UsersRound aria-hidden="true" size={20} />
                <span className="menuLabel">Users</span>
              </Link>
            </>
          ) : pathname === "/guest" ? (
            <Link
              aria-current={guestActive ? "page" : undefined}
              aria-label="Public Rooms"
              className={getMenuLinkClassName(guestActive)}
              href="/guest"
              title="Public Rooms"
            >
              <MessagesSquare aria-hidden="true" size={20} />
              <span className="menuLabel">Public Rooms</span>
            </Link>
          ) : null}
        </div>
        <div className="menuBottom">
          <NavTestModeToggle />
          <NavThemeToggle expanded={open} />
          {isAuthenticated ? (
            <>
              <Link
                aria-current={settingsActive ? "page" : undefined}
                aria-label="설정"
                className={getMenuLinkClassName(settingsActive)}
                href="/settings"
                title="설정"
              >
                <Settings aria-hidden="true" size={20} />
                <span className="menuLabel">설정</span>
              </Link>
              {onSignOut ? (
                <button
                  aria-label="로그아웃"
                  className="menuLink menuAction menuIconAction"
                  title="로그아웃"
                  type="button"
                  onClick={onSignOut}
                >
                  <LogOut aria-hidden="true" size={20} />
                  <span className="menuLabel">로그아웃</span>
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </nav>
    </aside>
  );
}

function isCurrentRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getMenuLinkClassName(active: boolean) {
  return `menuLink menuIconAction${active ? " active" : ""}`;
}
