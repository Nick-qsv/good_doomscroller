import { describe, expect, it, afterEach, vi } from "vitest";
import { analyticsAudience, analyticsOriginAllowed, analyticsReferrer, parseAnalyticsBatch, readAnalyticsBody } from "@/lib/analytics";

const event = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "page_view", path: "/" };
const parse = (events: unknown[]) => parseAnalyticsBatch({ events }, "Mozilla/5.0 Chrome/140.0 Safari/537.36", "gdscroll.com");
afterEach(() => vi.unstubAllEnvs());

describe("analytics data minimization and validation", () => {
  it("stores only allowed fields and a hostname, never an actor, timestamp, text, or arbitrary properties", () => {
    const [row] = parse([{ ...event, referrer: "EXAMPLE.COM", actorId: "reader", timestamp: "2000-01-01", text: "private", properties: { email: "reader@example.com" } }])!;
    expect(row).toEqual({ event_id: event.id, session_id: event.sessionId, event_name: "page_view", path: "/", passage_id: null, value: null, referrer_host: "example.com", device: "desktop", browser: "Chrome" });
  });
  it.each(["https://search.example.com/?q=private", "a@example.com", "127.0.0.1", "localhost", "host.internal", "gdscroll.com", "bad..com"])("does not store unsafe referrer %s", (value) => {
    expect(analyticsReferrer(value, "gdscroll.com")).toBeNull();
  });
  it("normalizes verification paths and rejects mismatched passage IDs and query strings", () => {
    const path = "/passages/demo-book-01/verification";
    expect(parse([{ ...event, path }])?.[0]).toMatchObject({ path: "/passages/:id/verification", passage_id: "demo-book-01" });
    expect(parse([{ ...event, path, passageId: "demo-other" }])).toBeNull();
    expect(parse([{ ...event, path: "/?email=private" }])).toBeNull();
  });
  it("rejects unknown names, invalid IDs, empty and oversized batches atomically", () => {
    for (const events of [[], Array(21).fill(event), [{ ...event, name: "typed_text" }], [{ ...event, id: "invalid" }], [event, { ...event, sessionId: "reader" }]]) {
      expect(parse(events)).toBeNull();
    }
  });
  it("bounds event-specific values and requires content identifiers", () => {
    expect(parse([{ ...event, name: "passage_read", passageId: "demo-book", value: 30000 }])).not.toBeNull();
    for (const invalid of [
      { name: "passage_read", passageId: "demo-book", value: 30001 },
      { name: "passage_view", value: 1 }, { name: "engagement", value: -1 },
      { name: "reaction", passageId: "demo-book", value: 0.5 },
      { name: "feed_load", value: 21 },
    ]) expect(parse([{ ...event, ...invalid }])).toBeNull();
  });
  it("reduces user agents to coarse dimensions and filters common automated clients", () => {
    expect(analyticsAudience("Mozilla iPad Safari/605")).toMatchObject({ device: "tablet", browser: "Safari" });
    expect(analyticsAudience("Mozilla Android Mobile Chrome/130 EdgA/130")).toMatchObject({ device: "mobile", browser: "Edge" });
    expect(analyticsAudience("Googlebot/2.1").bot).toBe(true);
    expect(analyticsAudience("Mozilla HeadlessChrome/120").bot).toBe(true);
  });
});

describe("analytics request boundary", () => {
  it("requires an allowed origin and rejects cross-site submissions", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://gdscroll.com");
    const req = (headers: Record<string, string>) => new Request("http://localhost:3000/api/analytics", { headers });
    expect(analyticsOriginAllowed(req({ origin: "https://gdscroll.com" }))).toBe(true);
    expect(analyticsOriginAllowed(req({ origin: "https://evil.example" }))).toBe(false);
    expect(analyticsOriginAllowed(req({ origin: "https://gdscroll.com", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(analyticsOriginAllowed(req({}))).toBe(false);
  });
  it("enforces a streaming byte cap even without Content-Length", async () => {
    const request = new Request("https://gdscroll.com/api/analytics", { method: "POST", body: "x".repeat(16385) });
    await expect(readAnalyticsBody(request)).rejects.toThrow(RangeError);
    await expect(readAnalyticsBody(new Request("https://gdscroll.com", { method: "POST", body: JSON.stringify({ events: [event] }) }))).resolves.toEqual({ events: [event] });
  });
});
