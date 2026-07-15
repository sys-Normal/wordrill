"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { OnlinePresenceProvider } from "./online-presence";
import RecentLoginRecorder from "./recent-login-recorder";
import { TestModeProvider } from "./test-mode";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <TestModeProvider>
        <RecentLoginRecorder />
        <OnlinePresenceProvider>{children}</OnlinePresenceProvider>
      </TestModeProvider>
    </SessionProvider>
  );
}
