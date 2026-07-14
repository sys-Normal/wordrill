"use client";

import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { OnlinePresenceProvider } from "./online-presence";
import RecentLoginRecorder from "./recent-login-recorder";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <RecentLoginRecorder />
      <OnlinePresenceProvider>{children}</OnlinePresenceProvider>
    </SessionProvider>
  );
}
