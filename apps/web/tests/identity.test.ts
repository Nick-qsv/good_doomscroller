import { describe, expect, it } from "vitest";

import {
  resolveActorCookieSecret,
  signActorId,
  verifyActorCookie,
} from "@/lib/identity";

describe("anonymous actor cookie", () => {
  const actorId = "5f46e52c-77cb-454a-9b5c-c1d0a83820aa";

  it("round-trips a signed actor id", () => {
    const cookie = signActorId(actorId, "test-secret");
    expect(verifyActorCookie(cookie, "test-secret")).toBe(actorId);
  });

  it("rejects a modified identity", () => {
    const cookie = signActorId(actorId, "test-secret");
    const tampered = `6f46e52c${cookie.slice(8)}`;
    expect(verifyActorCookie(tampered, "test-secret")).toBeNull();
  });

  it("rejects a cookie signed by a different secret", () => {
    const cookie = signActorId(actorId, "first-secret");
    expect(verifyActorCookie(cookie, "second-secret")).toBeNull();
  });

  it("fails closed when production has no strong actor secret", () => {
    expect(() => resolveActorCookieSecret({}, "production")).toThrow(
      /ACTOR_COOKIE_SECRET/,
    );
    expect(() =>
      resolveActorCookieSecret({ ACTOR_COOKIE_SECRET: "too-short" }, "production"),
    ).toThrow(/32 characters/);
  });

  it("accepts the preferred production secret name", () => {
    const secret = "a-secure-production-secret-that-is-long-enough";
    expect(
      resolveActorCookieSecret({ ACTOR_COOKIE_SECRET: secret }, "production"),
    ).toBe(secret);
  });
});
