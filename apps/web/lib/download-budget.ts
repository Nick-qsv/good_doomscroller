export const DAILY_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1_000;

type BudgetDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class DailyDownloadBudget {
  private day = -1;
  private usedBytes = 0;

  constructor(private readonly limit = DAILY_DOWNLOAD_BYTES) {}

  get reservedBytes(): number { return this.usedBytes; }

  reserve(byteLength: number, now = Date.now()): BudgetDecision {
    if (!Number.isSafeInteger(byteLength) || byteLength < 0) throw new Error("Download size must be a nonnegative integer");
    const day = Math.floor(now / DAY_MS);
    if (day > this.day) {
      this.day = day;
      this.usedBytes = 0;
    }
    if (byteLength > this.limit - this.usedBytes) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(((this.day + 1) * DAY_MS - now) / 1_000)),
      };
    }
    this.usedBytes += byteLength;
    return { allowed: true };
  }
}

declare global {
  var __goodDoomscrollerDownloadBudget: DailyDownloadBudget | undefined;
}

// Proof and source route bundles share this counter within the application
// process, including during local hot reload. It does not cross instances or
// survive process restarts, and is independent of the Next proxy process.
const budget = globalThis.__goodDoomscrollerDownloadBudget ?? new DailyDownloadBudget();
globalThis.__goodDoomscrollerDownloadBudget = budget;

export function reserveDownloadBytes(byteLength: number): Response | null {
  const result = budget.reserve(byteLength);
  if (result.allowed) return null;
  return Response.json({ error: "The library’s download allowance has been reached for today. Please try again tomorrow." }, {
    status: 429,
    headers: { "Cache-Control": "no-store", "Retry-After": String(result.retryAfterSeconds) },
  });
}
