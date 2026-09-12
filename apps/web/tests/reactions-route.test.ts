import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  isDatabaseConfigured: vi.fn(() => true),
  setDatabaseReaction: vi.fn(),
  setDemoReaction: vi.fn(),
  actorIdentity: vi.fn(() => ({ actorId: "test-actor", isNew: false })),
  attachActorCookie: vi.fn(),
}));

vi.mock("@/lib/database", () => ({ isDatabaseConfigured: mocked.isDatabaseConfigured, setDatabaseReaction: mocked.setDatabaseReaction }));
vi.mock("@/lib/demo-store", () => ({ setDemoReaction: mocked.setDemoReaction }));
vi.mock("@/lib/identity", () => ({ actorIdentity: mocked.actorIdentity, attachActorCookie: mocked.attachActorCookie }));

import { DELETE, PUT } from "@/app/api/reactions/[passageId]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocked.isDatabaseConfigured.mockReturnValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("production reactions", () => {
  it("rejects demo mutations before minting an actor or growing the in-memory map", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const context = { params: Promise.resolve({ passageId: "demo-pride-prejudice-01" }) };
    const put = await PUT(new NextRequest("https://goodoomscroller.com/api/reactions/demo-pride-prejudice-01", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: 1 }),
    }), context);
    const remove = await DELETE(new NextRequest("https://goodoomscroller.com/api/reactions/demo-pride-prejudice-01", { method: "DELETE" }), context);
    expect(put.status).toBe(404);
    expect(remove.status).toBe(404);
    expect(mocked.actorIdentity).not.toHaveBeenCalled();
    expect(mocked.setDemoReaction).not.toHaveBeenCalled();
    expect(mocked.setDatabaseReaction).not.toHaveBeenCalled();
  });

  it("still saves a real passage reaction with the database", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocked.setDatabaseReaction.mockResolvedValue({ passageId: "real-passage", likes: 1, dislikes: 0, viewerReaction: 1, mode: "database" });
    const response = await PUT(new NextRequest("https://goodoomscroller.com/api/reactions/real-passage", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: 1 }),
    }), { params: Promise.resolve({ passageId: "real-passage" }) });
    expect(response.status).toBe(200);
    expect(mocked.setDatabaseReaction).toHaveBeenCalledWith("test-actor", "real-passage", 1);
    expect(mocked.setDemoReaction).not.toHaveBeenCalled();
  });
});
