import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { createSocketTicket } from "../../../lib/socket-ticket";

export async function POST() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ticket: createSocketTicket(userId) });
}
