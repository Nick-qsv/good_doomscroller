import { createHash } from "node:crypto";
import { isIP } from "node:net";

export const TRUSTED_CLIENT_IP_HEADER = "x-doomscroller-client-ip";

type RequestGroup = "read" | "write" | "verification" | "download";
type BucketName = "all" | RequestGroup;
type Bucket = { tokens: number; updatedAt: number };
type ClientBuckets = { lastSeen: number; buckets: Partial<Record<BucketName, Bucket>> };
type Limits = Record<BucketName, number>;

// Each value is both the maximum immediate burst and the refill per minute.
const CLIENT_LIMITS: Limits = { all: 90, read: 90, write: 20, verification: 30, download: 4 };
const GLOBAL_LIMITS: Limits = { all: 600, read: 600, write: 120, verification: 120, download: 12 };
const MINUTE_MS = 60_000;
const CLIENT_IDLE_MS = 2 * MINUTE_MS;
const MAX_CLIENTS = 2_048;

function normalizedNetworkAddress(value: string): string | null {
  const family = isIP(value);
  if (family === 4) return value;
  if (family !== 6 || value.includes("%")) return null;

  // URL parsing canonicalizes compressed IPv6 and embedded IPv4 notation.
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const [left, right = ""] = canonical.split("::");
  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const parts = canonical.includes("::")
    ? [...leftParts, ...Array<string>(8 - leftParts.length - rightParts.length).fill("0"), ...rightParts]
    : leftParts;
  const numbers = parts.map((part) => Number.parseInt(part, 16));
  if (numbers.slice(0, 5).every((part) => part === 0) && numbers[5] === 0xffff) {
    return `${numbers[6] >> 8}.${numbers[6] & 255}.${numbers[7] >> 8}.${numbers[7] & 255}`;
  }
  // A client cannot evade the limit by rotating addresses in its IPv6 /64.
  return `${numbers.slice(0, 4).map((part) => part.toString(16)).join(":")}::/64`;
}

export function rateLimitClientKey(headers: Headers, trustCaddy: boolean): string {
  // Never infer a client from X-Forwarded-For, cookies, or user-supplied IDs.
  // This header is trustworthy only behind Caddy with header_up overwrite and
  // no publicly reachable application port. Without that setup, share a bucket.
  const forwarded = trustCaddy ? headers.get(TRUSTED_CLIENT_IP_HEADER)?.trim() : null;
  const address = forwarded ? normalizedNetworkAddress(forwarded) : null;
  return address
    ? createHash("sha256").update(address).digest("hex").slice(0, 24)
    : "unknown-client";
}

export function publicRequestGroup(pathname: string, method: string): RequestGroup {
  let path = pathname;
  try { path = decodeURIComponent(pathname); } catch { /* Invalid paths still use the shared read/write limits. */ }
  if (/\/verification\/(?:proof|source)\/?$/.test(path)) return "download";
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") return "write";
  if (/\/verification\/?$/.test(path)) return "verification";
  return "read";
}

function replenished(bucket: Bucket | undefined, limit: number, now: number): Bucket {
  if (!bucket) return { tokens: limit, updatedAt: now };
  return {
    tokens: Math.min(limit, bucket.tokens + Math.max(0, now - bucket.updatedAt) * limit / MINUTE_MS),
    updatedAt: Math.max(bucket.updatedAt, now),
  };
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class PublicRateLimiter {
  private readonly clients = new Map<string, ClientBuckets>();
  private readonly overflow: ClientBuckets = { lastSeen: 0, buckets: {} };
  private readonly globalBuckets: Partial<Record<BucketName, Bucket>> = {};
  private nextCleanup = 0;

  constructor(
    private readonly options: {
      maxClients?: number;
      clientLimits?: Partial<Limits>;
      globalLimits?: Partial<Limits>;
    } = {},
  ) {}

  get trackedClientCount(): number { return this.clients.size; }

  check(clientKey: string, group: RequestGroup, now = Date.now()): RateLimitDecision {
    if (now >= this.nextCleanup) {
      for (const [key, client] of this.clients) {
        if (now - client.lastSeen >= CLIENT_IDLE_MS) this.clients.delete(key);
      }
      this.nextCleanup = now + MINUTE_MS;
    }

    const known = this.clients.get(clientKey);
    const room = this.clients.size < (this.options.maxClients ?? MAX_CLIENTS);
    const client = known ?? (room ? { lastSeen: now, buckets: {} } : this.overflow);
    const names: BucketName[] = ["all", group];
    const checks = names.flatMap((name) => {
      const clientLimit = this.options.clientLimits?.[name] ?? CLIENT_LIMITS[name];
      const globalLimit = this.options.globalLimits?.[name] ?? GLOBAL_LIMITS[name];
      return [
        { owner: client.buckets, name, limit: clientLimit, bucket: replenished(client.buckets[name], clientLimit, now) },
        { owner: this.globalBuckets, name, limit: globalLimit, bucket: replenished(this.globalBuckets[name], globalLimit, now) },
      ];
    });
    const waitMs = Math.max(...checks.map(({ bucket, limit }) => (1 - bucket.tokens) * MINUTE_MS / limit));
    if (waitMs > 0) return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1_000)) };

    // A rejected client's repeated retries cannot drain other readers' budgets.
    for (const { owner, name, bucket } of checks) owner[name] = { ...bucket, tokens: bucket.tokens - 1 };
    client.lastSeen = now;
    if (!known && room) this.clients.set(clientKey, client);
    return { allowed: true };
  }
}
