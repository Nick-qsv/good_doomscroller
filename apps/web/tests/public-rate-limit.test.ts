import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicRateLimiter, publicRequestGroup, rateLimitClientKey } from "@/lib/public-rate-limit";
import { config, proxy } from "@/proxy";

afterEach(() => { vi.unstubAllEnvs(); });

describe("public API rate limits", () => {
  it("allows reading, reacting, and inspecting proof, then stops a write burst and recovers", () => {
    const limiter = new PublicRateLimiter();
    expect(limiter.check("reader", "read", 1_000).allowed).toBe(true);
    expect(limiter.check("reader", "verification", 1_000).allowed).toBe(true);
    expect(limiter.check("reader", "download", 1_000).allowed).toBe(true);
    for (let index = 0; index < 20; index++) expect(limiter.check("reader", "write", 1_000).allowed).toBe(true);
    expect(limiter.check("reader", "write", 1_000)).toEqual({ allowed: false, retryAfterSeconds: 3 });
    expect(limiter.check("reader", "write", 4_000).allowed).toBe(true);
    expect(limiter.check("other-reader", "write", 4_000).allowed).toBe(true);
  });

  it("enforces global proof limits even when each request has a new IP", () => {
    const limiter = new PublicRateLimiter();
    for (let index = 0; index < 12; index++) expect(limiter.check(`reader-${index}`, "download", 1_000).allowed).toBe(true);
    expect(limiter.check("another-new-reader", "download", 1_000)).toEqual({ allowed: false, retryAfterSeconds: 5 });
    expect(limiter.check("another-new-reader", "read", 1_000).allowed).toBe(true);
  });

  it("keeps client memory bounded and does not evict active readers during IP churn", () => {
    const limiter = new PublicRateLimiter({ maxClients: 2 });
    for (let index = 0; index < 50; index++) limiter.check(`client-${index}`, "write", 1_000);
    expect(limiter.trackedClientCount).toBe(2);
    expect(limiter.check("client-0", "write", 1_000).allowed).toBe(true);
    expect(limiter.check("brand-new-client", "write", 1_000).allowed).toBe(false);
    expect(limiter.check("returning-client", "write", 121_001).allowed).toBe(true);
    expect(limiter.trackedClientCount).toBe(1);
  });

  it("does not let a blocked client drain everyone's remaining global budget", () => {
    const limiter = new PublicRateLimiter({ clientLimits: { write: 1 }, globalLimits: { write: 2 } });
    expect(limiter.check("abusive-client", "write", 1_000).allowed).toBe(true);
    for (let index = 0; index < 50; index++) expect(limiter.check("abusive-client", "write", 1_000).allowed).toBe(false);
    expect(limiter.check("other-client", "write", 1_000).allowed).toBe(true);
    expect(limiter.check("third-client", "write", 1_000).allowed).toBe(false);
  });

  it("ignores spoofable forwarded headers and cookies, trusting only the configured Caddy overwrite", () => {
    const one = new Headers({ "x-forwarded-for": "192.0.2.1", cookie: "good_doomscroll_actor=first", "x-doomscroller-client-ip": "198.51.100.4" });
    const two = new Headers({ "x-forwarded-for": "192.0.2.2", cookie: "good_doomscroll_actor=second", "x-doomscroller-client-ip": "198.51.100.4" });
    expect(rateLimitClientKey(one, true)).toBe(rateLimitClientKey(two, true));
    expect(rateLimitClientKey(one, false)).toBe("unknown-client");
    expect(rateLimitClientKey(new Headers({ "x-forwarded-for": "192.0.2.3" }), true)).toBe("unknown-client");
    expect(rateLimitClientKey(new Headers({ "x-doomscroller-client-ip": "192.0.2.3, 192.0.2.4" }), true)).toBe("unknown-client");
  });

  it("groups IPv6 address rotations and alternate IP spellings into the same client", () => {
    const key = (ip: string) => rateLimitClientKey(new Headers({ "x-doomscroller-client-ip": ip }), true);
    expect(key("2001:db8:1234:5678::1")).toBe(key("2001:0db8:1234:5678:ffff:ffff:ffff:ffff"));
    expect(key("2001:db8:1234:5678::1")).not.toBe(key("2001:db8:1234:5679::1"));
    expect(key("::ffff:192.0.2.1")).toBe(key("192.0.2.1"));
    expect(key("192.0.2.1")).not.toContain("192.0.2.1");
  });

  it("covers SSR verification and every API variant without limiting static files or the feed page", () => {
    for (const url of ["/api/feed", "/api/reactions/one", "/api/health", "/api/passages/one/verification/source", "/passages/one/verification"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(true);
    }
    for (const url of ["/", "/_next/static/app.js", "/favicon.ico"]) {
      expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(false);
    }
    expect(publicRequestGroup("/api/reactions/one", "DELETE")).toBe("write");
    expect(publicRequestGroup("/api/passages/one/verification/%73ource", "HEAD")).toBe("download");
    expect(publicRequestGroup("/passages/one/verification", "GET")).toBe("verification");
  });

  it("returns 429 with retry guidance and no actor cookie before handling a request", async () => {
    vi.stubEnv("TRUST_CADDY_CLIENT_IP", "true");
    const request = new NextRequest("https://goodoomscroller.com/api/reactions/example", {
      method: "PUT", headers: { "x-doomscroller-client-ip": "203.0.113.99" },
    });
    for (let index = 0; index < 20; index++) expect(proxy(request).status).toBe(200);
    const response = proxy(request);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toEqual({ error: "Too many requests. Please wait a moment and try again." });
  });
});
