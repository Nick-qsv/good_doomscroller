import { afterEach, describe, expect, it, vi } from "vitest";

import { getDatabase } from "@/lib/database";

describe("database connection pool", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.__goodDoomscrollerDatabase = undefined;
  });

  it("reuses one pool in a production process", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://unused:unused@127.0.0.1:1/unused");

    const first = getDatabase();
    const second = getDatabase();

    expect(second).toBe(first);
    await first.end({ timeout: 0 });
  });
});
