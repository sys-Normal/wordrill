"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import ThemeToggle from "./theme-toggle";

type AppMenuProps = {
  isAuthenticated: boolean;
  onSignOut?: () => void;
};

export default function AppMenu({ isAuthenticated, onSignOut }: AppMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <aside className={`appMenu ${open ? "menuOpen" : ""}`} aria-label="Main menu">
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

      <nav className="menuPanel" aria-hidden={!open}>
        <ThemeToggle />
        {!isAuthenticated && pathname === "/guest" ? (
          <Link className="menuLink active" href="/guest">
            Public Rooms
          </Link>
        ) : null}
        {isAuthenticated ? (
          <>
            <Link className={`menuLink ${pathname === "/rooms" ? "active" : ""}`} href="/rooms">
              Rooms
            </Link>
            <Link
              aria-label="설정"
              className={`menuLink menuIconAction ${pathname === "/settings" ? "active" : ""}`}
              href="/settings"
              title="설정"
            >
              <Settings aria-hidden="true" size={20} />
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
              </button>
            ) : null}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
