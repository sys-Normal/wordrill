"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
        {isAuthenticated ? (
          <>
            <Link className={`menuLink ${pathname === "/" ? "active" : ""}`} href="/">
              Rooms
            </Link>
            <Link
              className={`menuLink ${pathname === "/settings" ? "active" : ""}`}
              href="/settings"
            >
              Settings
            </Link>
            {onSignOut ? (
              <button className="menuLink menuAction" type="button" onClick={onSignOut}>
                Logout
              </button>
            ) : null}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
