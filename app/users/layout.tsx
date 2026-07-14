import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "../../auth";

type UsersLayoutProps = {
  children: ReactNode;
};

export default async function UsersLayout({ children }: UsersLayoutProps) {
  const session = await auth();

  if (!session?.user) {
    redirect("/");
  }

  return children;
}
