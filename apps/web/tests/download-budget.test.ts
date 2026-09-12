import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DailyDownloadBudget } from "@/lib/download-budget";

const mocks = vi.hoisted(() => ({ getVerificationDownload: vi.fn() }));
vi.mock("@/lib/verification", () => ({ getVerificationDownload: mocks.getVerificationDownload }));

describe("daily download byte allowance", () => {
  it("reserves complete downloads without exceeding the remaining bytes", () => {
    const budget = new DailyDownloadBudget(10);
    const now = Date.UTC(2026, 8, 10, 12);
    expect(budget.reserve(6, now).allowed).toBe(true);
    expect(budget.reserve(5, now)).toEqual({ allowed: false, retryAfterSeconds: 43_200 });
    expect(budget.reservedBytes).toBe(6);
    expect(budget.reserve(4, now).allowed).toBe(true);
    expect(budget.reserve(1, now).allowed).toBe(false);
    expect(budget.reservedBytes).toBe(10);
  });

  it("replenishes at the next UTC day and cannot reset by moving the clock backwards", () => {
    const budget = new DailyDownloadBudget(10);
    const now = Date.UTC(2026, 8, 10, 23, 59, 59);
    expect(budget.reserve(10, now).allowed).toBe(true);
    expect(budget.reserve(1, now)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(budget.reserve(1, now - 86_400_000).allowed).toBe(false);
    expect(budget.reserve(10, now + 1_000).allowed).toBe(true);
    expect(budget.reservedBytes).toBe(10);
  });

  it("rejects negative or fractional sizes rather than granting more allowance", () => {
    const budget = new DailyDownloadBudget(10);
    for (const size of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => budget.reserve(size)).toThrow();
    expect(budget.reservedBytes).toBe(0);
  });
});

describe("download routes share their byte budget", () => {
  const original = globalThis.__goodDoomscrollerDownloadBudget;
  beforeEach(() => {
    vi.resetModules();
    mocks.getVerificationDownload.mockReset();
    globalThis.__goodDoomscrollerDownloadBudget = new DailyDownloadBudget(10);
  });
  afterEach(() => { globalThis.__goodDoomscrollerDownloadBudget = original; });

  it("counts actual UTF-8 bytes across both routes and does not send a file above the allowance", async () => {
    const source = await import("@/app/api/passages/[passageId]/verification/source/route");
    const proof = await import("@/app/api/passages/[passageId]/verification/proof/route");
    const context = { params: Promise.resolve({ passageId: "passage-one" }) };
    mocks.getVerificationDownload.mockResolvedValueOnce(Buffer.from("🌟ab"));
    const originalFile = await source.GET(new Request("https://goodoomscroller.com/source"), context);
    expect(originalFile.status).toBe(200);
    expect(originalFile.headers.get("content-length")).toBe("6");
    expect((await originalFile.arrayBuffer()).byteLength).toBe(6);

    mocks.getVerificationDownload.mockResolvedValueOnce(Buffer.from("12345"));
    const deniedProof = await proof.GET(new Request("https://goodoomscroller.com/proof"), context);
    expect(deniedProof.status).toBe(429);
    expect(deniedProof.headers.get("retry-after")).toBeTruthy();
    expect(deniedProof.headers.get("content-disposition")).toBeNull();
    expect(await deniedProof.text()).not.toContain("12345");
    expect(globalThis.__goodDoomscrollerDownloadBudget?.reservedBytes).toBe(6);
  });

  it("does not consume download bytes for missing/unpublished passages", async () => {
    const { GET } = await import("@/app/api/passages/[passageId]/verification/proof/route");
    mocks.getVerificationDownload.mockResolvedValueOnce(null);
    const response = await GET(new Request("https://goodoomscroller.com/proof"), { params: Promise.resolve({ passageId: "missing" }) });
    expect(response.status).toBe(404);
    expect(globalThis.__goodDoomscrollerDownloadBudget?.reservedBytes).toBe(0);
  });
});
