import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  isDatabaseConfigured: vi.fn(() => true),
  getDatabaseLibrary: vi.fn(),
  getDemoLibrary: vi.fn(),
  actorIdentity: vi.fn(),
  attachActorCookie: vi.fn(),
}));
vi.mock("@/lib/database", () => ({ isDatabaseConfigured: mocked.isDatabaseConfigured }));
vi.mock("@/lib/library", () => ({ getDatabaseLibrary: mocked.getDatabaseLibrary }));
vi.mock("@/lib/demo-store", () => ({ getDemoLibrary: mocked.getDemoLibrary }));
vi.mock("@/lib/identity", () => ({ actorIdentity: mocked.actorIdentity, attachActorCookie: mocked.attachActorCookie }));
import { GET } from "@/app/api/library/route";

const library = {
  books: [{ id: "book-1", title: "A book", author: "An author", count: 10 }],
  themes: [{ name: "society", count: 10 }], total: 10, mode: "database",
};
const demo = { ...library, mode: "demo" };

beforeEach(() => {
  vi.clearAllMocks();
  mocked.isDatabaseConfigured.mockReturnValue(true);
  mocked.getDatabaseLibrary.mockResolvedValue(library);
  mocked.getDemoLibrary.mockReturnValue(demo);
});

describe("public library catalog", () => {
  it("returns book/theme counts without identity or cookies and permits shared caching", async () => {
    const response = await GET();
    expect(await response.json()).toEqual(library);
    expect(response.headers.get("Cache-Control")).toContain("public");
    expect(response.headers.get("Set-Cookie")).toBeNull();
    expect(mocked.actorIdentity).not.toHaveBeenCalled();
    expect(mocked.attachActorCookie).not.toHaveBeenCalled();
    expect(mocked.getDemoLibrary).not.toHaveBeenCalled();
  });

  it("uses the demo catalog when no database is configured", async () => {
    mocked.isDatabaseConfigured.mockReturnValue(false);
    expect(await (await GET()).json()).toEqual(demo);
    expect(mocked.getDatabaseLibrary).not.toHaveBeenCalled();
  });

  it("uses the demo catalog when the published database is empty", async () => {
    mocked.getDatabaseLibrary.mockResolvedValue({ books: [], themes: [], total: 0, mode: "database" });
    expect(await (await GET()).json()).toEqual(demo);
  });

  it("reports a temporary database error instead of advertising unrelated demo filters", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    mocked.getDatabaseLibrary.mockRejectedValue(new Error("Unavailable"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocked.getDemoLibrary).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });
});
