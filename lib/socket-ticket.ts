import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const SOCKET_TICKET_AUDIENCE = "wordrill-socket";
const SOCKET_TICKET_MAX_AGE = 2 * 60;

type SocketTicketPayload = {
  aud: typeof SOCKET_TICKET_AUDIENCE;
  exp: number;
  iat: number;
  jti: string;
  sub: string;
};

export function createSocketTicket(userId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: SocketTicketPayload = {
    aud: SOCKET_TICKET_AUDIENCE,
    exp: issuedAt + SOCKET_TICKET_MAX_AGE,
    iat: issuedAt,
    jti: randomBytes(16).toString("hex"),
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

    const now = Math.floor(Date.now() / 1000);

    if (
      payload.aud !== SOCKET_TICKET_AUDIENCE ||
      typeof payload.sub !== "string" ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number" ||
      typeof payload.jti !== "string" ||
      payload.jti.length !== 32 ||
      payload.iat > now + 30 ||
      payload.exp <= now ||
      payload.exp - payload.iat !== SOCKET_TICKET_MAX_AGE
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
