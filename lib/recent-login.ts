import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const RECENT_LOGIN_COOKIE_PREFIX = "wordrill.recent.";
export const RECENT_LOGIN_MAX_AGE = 30 * 24 * 60 * 60;

type RecentLoginPayload = {
  exp: number;
  presetId: string;
  sub: string;
};

export function createRecentLoginPreset(userId: string) {
  const presetId = createHash("sha256").update(userId).digest("hex").slice(0, 16);
  const payload: RecentLoginPayload = {
    exp: Math.floor(Date.now() / 1000) + RECENT_LOGIN_MAX_AGE,
    presetId,
    sub: userId
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload);

  return {
    cookieName: `${RECENT_LOGIN_COOKIE_PREFIX}${presetId}`,
    presetId,
    token: `${encodedPayload}.${signature}`
  };
}

export function verifyRecentLoginToken(token: string | undefined) {
  if (!token) {
    return null;
  }

  const [encodedPayload, encodedSignature, extra] = token.split(".");

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
    ) as Partial<RecentLoginPayload>;

    if (
      typeof payload.sub !== "string" ||
      typeof payload.presetId !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }

    return payload as RecentLoginPayload;
  } catch {
    return null;
  }
}

export function readCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const cookieName = part.slice(0, separator).trim();

    if (cookieName === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return undefined;
}

function sign(value: string) {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is required for recent login presets.");
  }

  return createHmac("sha256", secret).update(value).digest("base64url");
}
