import { NextResponse } from "next/server";
import { auth } from "../../../auth";
import { getSessionUser } from "../../../lib/session-user";
import { createSocketTicket } from "../../../lib/socket-ticket";

export async function POST() {
  const session = await auth();
  const user = await getSessionUser(session);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ticket: createSocketTicket(user.id) });
}
