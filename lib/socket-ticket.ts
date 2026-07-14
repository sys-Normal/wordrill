import { createHmac, timingSafeEqual } from "node:crypto";

const SOCKET_TICKET_MAX_AGE = 5 * 60;

type SocketTicketPayload = {
  exp: number;
  sub: string;
};

export function createSocketTicket(userId: string) {
  const payload: SocketTicketPayload = {
    exp: Math.floor(Date.now() / 1000) + SOCKET_TICKET_MAX_AGE,
    sub: userId
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifySocketTicket(ticket: unknown) {
  if (typeof ticket !== "string") {
    return null;
  }

  const [encodedPayload, encodedSignature, extra] = ticket.split(".");

  if (!encodedPayload || !encodedSignature || extra) {
    return null;
  }

  const expected = Buffer.from(sign(encodedPayload));
  const actual = Buffer.from(encodedSignature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Partial<SocketTicketPayload>;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload as SocketTicketPayload;
  } catch {
    return null;
  }
}

function sign(value: string) {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required for socket tickets.");
  }

  return createHmac("sha256", secret)
    .update(`wordrill-socket:${value}`)
    .digest("base64url");
}
