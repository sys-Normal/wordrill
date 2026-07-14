"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./use-theme";

type NavThemeToggleProps = {
  expanded: boolean;
};

export default function NavThemeToggle({ expanded }: NavThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const currentMode = isDark ? "다크 모드" : "라이트 모드";
  const actionLabel = isDark ? "라이트 모드로 전환" : "다크 모드로 전환";

  return (
    <button
      aria-label={actionLabel}
      aria-pressed={isDark}
      className="menuLink menuAction menuIconAction navThemeToggle"
      data-expanded={expanded}
      title={actionLabel}
      type="button"
      onClick={toggleTheme}
    >
      {isDark ? (
        <Moon aria-hidden="true" size={20} />
      ) : (
        <Sun aria-hidden="true" size={20} />
      )}
      <span className="menuLabel">{currentMode}</span>
    </button>
  );
}
