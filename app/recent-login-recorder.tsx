"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

export default function RecentLoginRecorder() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      return;
    }

    fetch("/api/auth/recent-login", { method: "POST" }).catch(() => undefined);
  }, [session?.user?.id, status]);

  return null;
}
