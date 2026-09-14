import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  isDatabaseConfigured: vi.fn(() => true),
  getDatabaseFeed: vi.fn(),
  getDemoFeed: vi.fn(),
  actorIdentity: vi.fn(() => ({ actorId: "test-actor", isNew: false })),
  attachActorCookie: vi.fn(),
}));
vi.mock("@/lib/database", () => ({ isDatabaseConfigured: mocked.isDatabaseConfigured, getDatabaseFeed: mocked.getDatabaseFeed }));
vi.mock("@/lib/demo-store", () => ({ getDemoFeed: mocked.getDemoFeed }));
vi.mock("@/lib/identity", () => ({ actorIdentity: mocked.actorIdentity, attachActorCookie: mocked.attachActorCookie }));
import { GET } from "@/app/api/feed/route";

const page = { items: [{ id: "real-passage" }], nextCursor: randomUUID(), mode: "database", revisited: false };
const demoPage = { items: [{ id: "demo-passage" }], nextCursor: randomUUID(), mode: "demo", revisited: false };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.isDatabaseConfigured.mockReturnValue(true);
  mocked.getDatabaseFeed.mockResolvedValue(page);
  mocked.getDemoFeed.mockReturnValue(demoPage);
});

describe("fresh feed route", () => {
  it("preserves an opaque retry cursor and the browser identity without caching", async () => {
    const cursor = randomUUID();
    const response = await GET(new NextRequest(`https://example.com/api/feed?cursor=${cursor}&limit=6`));
    expect(mocked.getDatabaseFeed).toHaveBeenCalledWith("test-actor", cursor, 6, {});
    expect(await response.json()).toEqual(page);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocked.attachActorCookie).toHaveBeenCalled();
    expect(mocked.getDemoFeed).not.toHaveBeenCalled();
  });

  it("creates a fresh visit for missing or legacy numeric cursors and bounds page sizes", async () => {
    for (const query of ["", "?cursor=0&limit=999", "?cursor=100&limit=0"]) {
      await GET(new NextRequest(`https://example.com/api/feed${query}`));
    }
    const calls = mocked.getDatabaseFeed.mock.calls;
    expect(calls.map((call) => call[2])).toEqual([6, 20, 1]);
    for (const call of calls) expect(call[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Set(calls.map((call) => call[1])).size).toBe(3);
  });

  it("rejects malformed and overlong cursors before touching feed memory", async () => {
    for (const cursor of ["NaN", "-1", "1e10", "x".repeat(500), "10000000"]) {
      const response = await GET(new NextRequest(`https://example.com/api/feed?cursor=${cursor}`));
      expect(response.status).toBe(400);
    }
    expect(mocked.getDatabaseFeed).not.toHaveBeenCalled();
    expect(mocked.getDemoFeed).not.toHaveBeenCalled();
    expect(mocked.actorIdentity).not.toHaveBeenCalled();
  });

  it("continues demo fallback on later cursors while the published database is empty", async () => {
    mocked.getDatabaseFeed.mockResolvedValue({ items: [], nextCursor: null, mode: "database", totalPublished: 0, totalMatching: 0 });
    for (let index = 0; index < 3; index += 1) {
      const cursor = randomUUID();
      const response = await GET(new NextRequest(`https://example.com/api/feed?cursor=${cursor}`));
      expect(await response.json()).toEqual(demoPage);
      expect(mocked.getDemoFeed).toHaveBeenLastCalledWith("test-actor", cursor, 6, {});
    }
  });

  it("uses a real partial or revisited page without switching to demo", async () => {
    mocked.getDatabaseFeed.mockResolvedValue({ ...page, revisited: true });
    const response = await GET(new NextRequest(`https://example.com/api/feed?cursor=${randomUUID()}`));
    expect((await response.json()).mode).toBe("database");
    expect(mocked.getDemoFeed).not.toHaveBeenCalled();
  });

  it("returns a retryable error instead of substituting demo during a database outage", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mocked.getDatabaseFeed.mockRejectedValueOnce(new Error("Unavailable"));
    const cursor = randomUUID();
    const request = new NextRequest(`https://example.com/api/feed?cursor=${cursor}`);
    const unavailable = await GET(request);
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocked.getDemoFeed).not.toHaveBeenCalled();
    const retry = await GET(request);
    expect(retry.status).toBe(200);
    expect(mocked.getDatabaseFeed).toHaveBeenLastCalledWith("test-actor", cursor, 6, {});
    errorLog.mockRestore();
  });

  it("serves demo with the same identity and cursor when no database is configured", async () => {
    mocked.isDatabaseConfigured.mockReturnValue(false);
    const cursor = randomUUID();
    const response = await GET(new NextRequest(`https://example.com/api/feed?cursor=${cursor}`));
    expect(await response.json()).toEqual(demoPage);
    expect(mocked.getDatabaseFeed).not.toHaveBeenCalled();
    expect(mocked.getDemoFeed).toHaveBeenCalledWith("test-actor", cursor, 6, {});
  });

  it("passes both book and exact theme filters on a fresh visit", async () => {
    const book = randomUUID();
    const theme = "self & society";
    const params = new URLSearchParams({ book: book.toUpperCase(), theme });
    await GET(new NextRequest(`https://example.com/api/feed?${params}`));
    expect(mocked.getDatabaseFeed).toHaveBeenCalledWith("test-actor", expect.any(String), 6, { bookId: book, theme });
  });

  it("returns no matches from the real library without substituting demo", async () => {
    const empty = { items: [], nextCursor: null, mode: "database", totalPublished: 24, totalMatching: 0 };
    mocked.getDatabaseFeed.mockResolvedValue(empty);
    const response = await GET(new NextRequest("https://example.com/api/feed?theme=unknown"));
    expect(await response.json()).toEqual(empty);
    expect(mocked.getDemoFeed).not.toHaveBeenCalled();
  });

  it("keeps filters when an entirely empty database uses demo mode", async () => {
    mocked.getDatabaseFeed.mockResolvedValue({ items: [], nextCursor: null, mode: "database", totalPublished: 0, totalMatching: 0 });
    await GET(new NextRequest("https://example.com/api/feed?theme=society"));
    expect(mocked.getDemoFeed).toHaveBeenCalledWith("test-actor", expect.any(String), 6, { theme: "society" });
  });

  it("rejects oversized or malformed filters before creating an actor", async () => {
    for (const params of [
      new URLSearchParams({ book: "x".repeat(129) }),
      new URLSearchParams({ book: "bad/book" }),
      new URLSearchParams({ theme: "x".repeat(129) }),
      new URLSearchParams({ theme: "bad\ntheme" }),
    ]) {
      const response = await GET(new NextRequest(`https://example.com/api/feed?${params}`));
      expect(response.status).toBe(400);
    }
    expect(mocked.actorIdentity).not.toHaveBeenCalled();
    expect(mocked.getDatabaseFeed).not.toHaveBeenCalled();
  });

  it("treats empty filter parameters as the full library", async () => {
    await GET(new NextRequest("https://example.com/api/feed?book=&theme="));
    expect(mocked.getDatabaseFeed).toHaveBeenCalledWith("test-actor", expect.any(String), 6, {});
  });
});
