"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MessagesSquare, Settings, UsersRound } from "lucide-react";
import NavThemeToggle from "./nav-theme-toggle";

type AppMenuProps = {
  isAuthenticated: boolean;
  onSignOut?: () => void;
};

export default function AppMenu({ isAuthenticated, onSignOut }: AppMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
                aria-label="Rooms"
                className="menuLink menuIconAction"
                href="/rooms"
                title="Rooms"
              >
                <MessagesSquare aria-hidden="true" size={20} />
                <span className="menuLabel">Rooms</span>
              </Link>
              <Link
                aria-label="Users"
                className="menuLink menuIconAction"
                href="/users"
                title="Users"
              >
                <UsersRound aria-hidden="true" size={20} />
                <span className="menuLabel">Users</span>
              </Link>
            </>
          ) : pathname === "/guest" ? (
            <Link
              aria-label="Public Rooms"
              className="menuLink menuIconAction"
              href="/guest"
              title="Public Rooms"
            >
              <MessagesSquare aria-hidden="true" size={20} />
              <span className="menuLabel">Public Rooms</span>
            </Link>
          ) : null}
        </div>
        <div className="menuBottom">
          <NavThemeToggle expanded={open} />
          {isAuthenticated ? (
            <>
              <Link
                aria-label="설정"
                className={`menuLink menuIconAction ${pathname === "/settings" ? "active" : ""}`}
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
