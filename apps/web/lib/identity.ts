import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import type { NextRequest, NextResponse } from "next/server";

export const ACTOR_COOKIE_NAME = "good_doomscroll_actor";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

const LOCAL_COOKIE_SECRET = "local-demo-only-change-me-before-deploying";

export function resolveActorCookieSecret(
  environment: { ACTOR_COOKIE_SECRET?: string; COOKIE_SECRET?: string },
  nodeEnvironment: string | undefined,
): string {
  const configured = environment.ACTOR_COOKIE_SECRET ?? environment.COOKIE_SECRET;

  if (nodeEnvironment === "production" && (!configured || configured.length < 32)) {
    throw new Error(
      "ACTOR_COOKIE_SECRET must contain at least 32 characters in production",
    );
  }

  // The fallback intentionally makes a fresh local checkout zero-configuration.
  // It is rejected above for every production build.
  return configured ?? LOCAL_COOKIE_SECRET;
}

function cookieSecret(): string {
  return resolveActorCookieSecret(
    {
      ACTOR_COOKIE_SECRET: process.env.ACTOR_COOKIE_SECRET,
      COOKIE_SECRET: process.env.COOKIE_SECRET,
    },
    process.env.NODE_ENV,
  );
}

export function assertActorCookieConfiguration(): void {
  cookieSecret();
}

function signature(actorId: string, secret: string): string {
  return createHmac("sha256", secret).update(actorId).digest("base64url");
}

export function signActorId(actorId: string, secret = cookieSecret()): string {
  return `${actorId}.${signature(actorId, secret)}`;
}

export function verifyActorCookie(
  cookie: string | undefined,
  secret = cookieSecret(),
): string | null {
  if (!cookie) return null;

  const separator = cookie.lastIndexOf(".");
  if (separator <= 0) return null;

  const actorId = cookie.slice(0, separator);
  const providedSignature = cookie.slice(separator + 1);
  if (!/^[0-9a-f-]{36}$/i.test(actorId)) return null;

  const expected = Buffer.from(signature(actorId, secret));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  return actorId;
}

export type ActorIdentity = {
  actorId: string;
  isNew: boolean;
};

export function actorIdentity(request: NextRequest): ActorIdentity {
  const existing = verifyActorCookie(
    request.cookies.get(ACTOR_COOKIE_NAME)?.value,
  );

  return existing
    ? { actorId: existing, isNew: false }
    : { actorId: randomUUID(), isNew: true };
}

export function attachActorCookie(
  request: NextRequest,
  response: NextResponse,
  identity: ActorIdentity,
): void {
  if (!identity.isNew) return;

  const forwardedProtocol = request.headers.get("x-forwarded-proto");
  const secure = forwardedProtocol === "https" || request.nextUrl.protocol === "https:";

  response.cookies.set({
    name: ACTOR_COOKIE_NAME,
    value: signActorId(identity.actorId),
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
}
