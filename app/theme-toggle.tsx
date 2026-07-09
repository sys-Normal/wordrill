"use client";

import { useEffect, useState } from "react";
import {
  browserStorageKeys,
  getLocalStorageItem,
  setLocalStorageItem
} from "../lib/browser-storage";

type Theme = "dark" | "light";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const storedTheme = getLocalStorageItem(browserStorageKeys.local.preferences.theme);
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    const nextTheme = storedTheme === "dark" || storedTheme === "light"
      ? storedTheme
      : systemTheme;

    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    setLocalStorageItem(browserStorageKeys.local.preferences.theme, nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <button
      aria-label="Toggle dark mode"
      aria-pressed={theme === "dark"}
      className="themeToggle"
      type="button"
      onClick={toggleTheme}
    >
      <span className="themeToggleTrack">
        <span className="themeToggleThumb" />
      </span>
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}
