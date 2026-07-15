"use client";

import { FlaskConical } from "lucide-react";
import { useTestMode } from "./test-mode";

export default function NavTestModeToggle() {
  const { isLocalEnvironment, testModeEnabled, toggleTestMode } = useTestMode();

  if (!isLocalEnvironment) {
    return null;
  }

  const actionLabel = testModeEnabled ? "테스트 모드 끄기" : "테스트 모드 켜기";

  return (
    <button
      aria-label={actionLabel}
      aria-pressed={testModeEnabled}
      className="menuLink menuAction menuIconAction navTestModeToggle"
      title={actionLabel}
      type="button"
      onClick={toggleTestMode}
    >
      <FlaskConical aria-hidden="true" size={20} />
      <span className="menuLabel">테스트 모드</span>
    </button>
  );
}
