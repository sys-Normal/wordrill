import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "../../auth";

type RoomsLayoutProps = {
  children: ReactNode;
};

export default async function RoomsLayout({ children }: RoomsLayoutProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return children;
}
