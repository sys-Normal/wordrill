"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./use-theme";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      aria-label="Toggle dark mode"
      aria-pressed={theme === "dark"}
      className="themeToggle"
      type="button"
      onClick={toggleTheme}
    >
      <span className="themeToggleTrack" aria-hidden="true">
        <span className="themeToggleThumb">
          {theme === "dark" ? (
            <Moon className="themeToggleIcon" size={15} strokeWidth={2.5} />
          ) : (
            <Sun className="themeToggleIcon" size={15} strokeWidth={2.5} />
          )}
        </span>
      </span>
    </button>
  );
}
