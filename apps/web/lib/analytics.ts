import { isIP } from "node:net";

export const ANALYTICS_BODY_LIMIT = 16_384;
export const ANALYTICS_BATCH_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PASSAGE_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|demo-[a-z0-9-]{1,70})$/i;
const CONTENT_EVENTS = new Set([
  "passage_view", "passage_read", "ai_context_view", "reaction", "reaction_error",
  "verification_open", "source_open", "proof_expand", "proof_download", "source_download",
]);
const EVENTS = new Set([
  "page_view", "engagement", ...CONTENT_EVENTS, "feed_load", "feed_error", "feed_end", "back_to_top",
]);

export type AnalyticsEvent = {
  event_id: string;
  session_id: string;
  event_name: string;
  path: string;
  passage_id: string | null;
  value: number | null;
  referrer_host: string | null;
  device: "mobile" | "tablet" | "desktop" | "unknown";
  browser: "Chrome" | "Safari" | "Firefox" | "Edge" | "Other";
};

export function analyticsAudience(userAgent: string | null) {
  const ua = (userAgent ?? "").slice(0, 1024);
  const bot = /bot\b|crawler|spider|headless|lighthouse|pagespeed|monitor|uptime|curl\/|wget\/|python|facebookexternalhit|preview/i.test(ua);
  const device: AnalyticsEvent["device"] = !ua ? "unknown"
    : /ipad|tablet|android(?!.*mobile)/i.test(ua) ? "tablet"
    : /mobile|iphone|ipod/i.test(ua) ? "mobile" : "desktop";
  const browser: AnalyticsEvent["browser"] = /edg(?:e|a|ios)?\//i.test(ua) ? "Edge"
    : /firefox\/|fxios\//i.test(ua) ? "Firefox"
    : /chrome\/|crios\//i.test(ua) ? "Chrome"
    : /safari\//i.test(ua) ? "Safari" : "Other";
  return { bot, device, browser };
}

export function analyticsReferrer(value: unknown, siteHost: string): string | null {
  if (typeof value !== "string" || value.length > 253) return null;
  const host = value.toLowerCase().replace(/\.$/, "");
  if (isIP(host) || !host.includes(".") || host === siteHost.toLowerCase()) return null;
  if (!host.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  if (/\.(?:local|localhost|internal|test|invalid)$/.test(host)) return null;
  return host;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAnalyticsBatch(body: unknown, userAgent: string | null, siteHost: string): AnalyticsEvent[] | null {
  if (!record(body) || !Array.isArray(body.events) || !body.events.length || body.events.length > ANALYTICS_BATCH_LIMIT) return null;
  const audience = analyticsAudience(userAgent);
  const events: AnalyticsEvent[] = [];
  for (const raw of body.events) {
    if (!record(raw) || typeof raw.id !== "string" || !UUID.test(raw.id)
      || typeof raw.sessionId !== "string" || !UUID.test(raw.sessionId)
      || typeof raw.name !== "string" || !EVENTS.has(raw.name) || typeof raw.path !== "string") return null;
    const match = raw.path.match(/^\/passages\/([^/?#]+)\/verification$/);
    const path = raw.path === "/" ? "/" : match && PASSAGE_ID.test(match[1]) ? "/passages/:id/verification" : null;
    if (!path) return null;
    if (raw.passageId !== undefined && (typeof raw.passageId !== "string" || !PASSAGE_ID.test(raw.passageId))) return null;
    const passageId = typeof raw.passageId === "string" ? raw.passageId : match?.[1] ?? null;
    if (CONTENT_EVENTS.has(raw.name) && !passageId) return null;
    if (match && passageId !== match[1]) return null;
    let value: number | null = null;
    const range = raw.name === "reaction" ? [-1, 1]
      : raw.name === "engagement" || raw.name === "passage_read" ? [1, 30_000]
      : raw.name === "passage_view" ? [1, 1_000_000]
      : raw.name === "feed_load" ? [0, 20] : null;
    if (range) {
      if (typeof raw.value !== "number" || !Number.isInteger(raw.value) || raw.value < range[0] || raw.value > range[1]) return null;
      value = raw.value;
    }
    events.push({
      event_id: raw.id.toLowerCase(), session_id: raw.sessionId.toLowerCase(), event_name: raw.name,
      path, passage_id: passageId, value,
      referrer_host: raw.name === "page_view" ? analyticsReferrer(raw.referrer, siteHost) : null,
      device: audience.device, browser: audience.browser,
    });
  }
  return events;
}

export function analyticsOriginAllowed(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    try { allowed.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin); } catch { /* Invalid site config cannot grant access. */ }
  }
  return allowed.has(origin);
}

// Bound bytes as they arrive, including requests without Content-Length.
export async function readAnalyticsBody(request: Request): Promise<unknown> {
  const length = Number(request.headers.get("content-length"));
  if (length > ANALYTICS_BODY_LIMIT) throw new RangeError("Body too large");
  if (!request.body) throw new SyntaxError("Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new SyntaxError("Request timed out");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > ANALYTICS_BODY_LIMIT) {
        void reader.cancel().catch(() => {});
        throw new RangeError("Body too large");
      }
      chunks.push(value);
    }
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}
