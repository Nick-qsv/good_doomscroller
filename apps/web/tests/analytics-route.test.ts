import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ save: vi.fn(), configured: vi.fn(() => true) }));
vi.mock("@/lib/analytics-store", () => ({ saveAnalyticsEvents: mocked.save }));
vi.mock("@/lib/database", () => ({ isDatabaseConfigured: mocked.configured }));
import { POST } from "@/app/api/analytics/route";

function request(extra: Record<string, string> = {}, body: unknown = { events: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "page_view", path: "/" }] }) {
  return new Request("https://gdscroll.com/api/analytics", { method: "POST", headers: { origin: "https://gdscroll.com", "content-type": "application/json", "user-agent": "Safari/605", ...extra }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); mocked.save.mockResolvedValue(undefined); mocked.configured.mockReturnValue(true); });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("analytics ingestion", () => {
  it("accepts a valid batch without reading or minting identity cookies", async () => {
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocked.save).toHaveBeenCalledOnce();
  });
  it.each<Record<string, string>>([{ dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "Googlebot/2.1" }])("does not store excluded traffic %j", async (headers) => {
    expect((await POST(request(headers))).status).toBe(204);
    expect(mocked.save).not.toHaveBeenCalled();
  });
  it("has a server kill switch and a no-database fallback", async () => {
    vi.stubEnv("ANALYTICS_ENABLED", "false");
    expect((await POST(request())).status).toBe(204);
    vi.stubEnv("ANALYTICS_ENABLED", "true");
    mocked.configured.mockReturnValue(false);
    expect((await POST(request())).status).toBe(204);
    expect(mocked.save).not.toHaveBeenCalled();
  });
  it("rejects foreign origins, payload types, malformed events, and oversized bodies", async () => {
    expect((await POST(request({ origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(request({ "content-type": "text/plain" }))).status).toBe(415);
    expect((await POST(request({}, { events: [] }))).status).toBe(400);
    expect((await POST(request({}, "x".repeat(16385)))).status).toBe(413);
    expect(mocked.save).not.toHaveBeenCalled();
  });
  it("returns an isolated unavailable response without disclosing storage errors", async () => {
    mocked.save.mockRejectedValue(new Error("sensitive database detail"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sensitive");
    expect(warning).toHaveBeenCalledWith("Analytics event storage unavailable");
  });
});
