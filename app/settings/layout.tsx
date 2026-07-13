import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "../../auth";

type SettingsLayoutProps = {
  children: ReactNode;
};

export default async function SettingsLayout({ children }: SettingsLayoutProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return children;
}
