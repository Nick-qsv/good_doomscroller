/** First-party, anonymous product analytics. Never attach actor cookies or raw URLs. */
export type AnalyticsEventName =
  | "page_view" | "engagement" | "passage_view" | "passage_read"
  | "ai_context_view" | "reaction" | "verification_open" | "source_open"
  | "proof_expand" | "proof_download" | "source_download" | "feed_load"
  | "feed_error" | "reaction_error" | "feed_end" | "back_to_top";

export type AnalyticsProperties = { passageId?: string; value?: number };
export type AnalyticsEvent = AnalyticsProperties & {
  id: string;
  sessionId: string;
  name: AnalyticsEventName;
  path: string;
  referrer?: string;
};

export const ANALYTICS_OPT_OUT_KEY = "good-doomscroller.analytics.disabled";
const SESSION_KEY = "good-doomscroller.analytics.session";
const PREFERENCE_EVENT = "good-doomscroller-analytics-preference";
const SESSION_TIMEOUT = 30 * 60_000;
const IDLE_TIMEOUT = 60_000;
const MAX_QUEUE = 100;
const BATCH_SIZE = 20;
const PASSAGE_ID = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|demo-[a-z0-9-]{1,70})$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const activitySubscribers = new Set<{ tick: (activeMs: number) => void; flush: () => void }>();
let activeClient: AnalyticsClient | undefined;
let memoryOptOut = false;

function activateClient(client: AnalyticsClient | undefined) { activeClient = client; }

type Session = { id: string; lastActivity: number };

export function analyticsOptedOut(): boolean {
  if (typeof window === "undefined") return false;
  try { return localStorage.getItem(ANALYTICS_OPT_OUT_KEY) === "true"; }
  catch { return memoryOptOut; }
}

export function browserRequestsAnalyticsPrivacy(): boolean {
  if (typeof navigator === "undefined") return false;
  const privacyNavigator = navigator as Navigator & { globalPrivacyControl?: boolean; msDoNotTrack?: string };
  return privacyNavigator.globalPrivacyControl === true ||
    navigator.doNotTrack === "1" || navigator.doNotTrack === "yes" ||
    privacyNavigator.msDoNotTrack === "1";
}

export function setAnalyticsOptOut(disabled: boolean): void {
  memoryOptOut = disabled;
  try { localStorage.setItem(ANALYTICS_OPT_OUT_KEY, String(disabled)); } catch { /* Private browsing may disallow storage. */ }
  if (disabled) activeClient?.clear();
  window.dispatchEvent(new Event(PREFERENCE_EVENT));
}

export function subscribeAnalyticsPreference(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener(PREFERENCE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PREFERENCE_EVENT, callback);
  };
}

export function trackAnalytics(name: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
  activeClient?.track(name, properties);
}

export function subscribeAnalyticsActivity(tick: (activeMs: number) => void, flush: () => void): () => void {
  const subscription = { tick, flush };
  activitySubscribers.add(subscription);
  return () => {
    flush();
    activitySubscribers.delete(subscription);
  };
}

function safePath(path: string): string | null {
  const pathname = path.split(/[?#]/, 1)[0];
  const match = pathname.match(/^\/passages\/([^/]+)\/verification\/?$/);
  return pathname === "/" ? "/" : match && PASSAGE_ID.test(match[1])
    ? `/passages/${match[1]}/verification` : null;
}

/** The only referrer data that can leave the browser is an external hostname. */
export function externalReferrerHostname(referrer: string, currentHostname: string): string | undefined {
  try {
    const url = new URL(referrer);
    return ["http:", "https:"].includes(url.protocol) && url.hostname !== currentHostname
      ? url.hostname.slice(0, 253) : undefined;
  } catch { return undefined; }
}

export class AnalyticsClient {
  private queue: AnalyticsEvent[] = [];
  private session?: Session;
  private path: string | null = null;
  private lastPage: string | null = null;
  private lastInput = Date.now();
  private lastTick = Date.now();
  private engagement = 0;
  private interval?: ReturnType<typeof setInterval>;
  private flushInterval?: ReturnType<typeof setInterval>;
  private sending = false;
  private sessionNeedsPageView = false;
  private entryReferrerPending = true;

  constructor(private enabled: boolean) {}

  private allowed(): boolean {
    return this.enabled && !analyticsOptedOut() && !browserRequestsAnalyticsPrivacy();
  }

  private currentSession(now: number): string | undefined {
    if (!this.session) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
        if (stored && UUID.test(stored.id) && Number.isFinite(stored.lastActivity)) this.session = stored;
      } catch { /* A memory-only session still works when storage is unavailable. */ }
    }
    if (!this.session || now - this.session.lastActivity > SESSION_TIMEOUT || this.session.lastActivity > now) {
      if (!globalThis.crypto?.randomUUID) return undefined;
      this.session = { id: crypto.randomUUID(), lastActivity: now };
      this.sessionNeedsPageView = true;
    }
    this.session.lastActivity = now;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(this.session)); } catch { /* Optional storage. */ }
    return this.session.id;
  }

  track(name: AnalyticsEventName, properties: AnalyticsProperties = {}): void {
    if (!this.allowed() || !this.path || (properties.passageId !== undefined && !PASSAGE_ID.test(properties.passageId))) return;
    try {
      const sessionId = this.currentSession(Date.now());
      if (!sessionId) return;
      if (this.sessionNeedsPageView && name !== "page_view") {
        this.enqueue({ id: crypto.randomUUID(), sessionId, name: "page_view", path: this.path });
      }
      this.sessionNeedsPageView = false;
      const event: AnalyticsEvent = { id: crypto.randomUUID(), sessionId, name, path: this.path, ...properties };
      if (name === "page_view" && this.entryReferrerPending) {
        const referrer = externalReferrerHostname(document.referrer, window.location.hostname);
        if (referrer) event.referrer = referrer;
      }
      this.entryReferrerPending = false;
      this.enqueue(event);
    } catch { /* Analytics must never interrupt a reader interaction. */ }
  }

  private enqueue(event: AnalyticsEvent): void {
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    this.queue.push(event);
  }

  setPage(path: string): void {
    const next = safePath(path);
    if (next === this.path && this.lastPage === next) return;
    this.flushActivity();
    this.path = next;
    this.lastTick = Date.now();
    this.lastInput = Date.now();
    if (next && this.allowed()) {
      this.track("page_view");
      this.lastPage = next;
    } else this.lastPage = null;
  }

  private onInput = (): void => { this.lastInput = Date.now(); };
  private onVisibility = (): void => {
    // Do not attribute the time spent in a hidden tab to reading on return.
    this.lastTick = Date.now();
    if (document.visibilityState === "hidden") this.flushActivity();
    else this.lastInput = Date.now();
    if (document.visibilityState === "hidden") void this.flush(true);
  };
  private onPageHide = (): void => { this.flushActivity(); void this.flush(true); };
  private onPrivacy = (): void => { if (!this.allowed()) this.clear(); };

  sample = (): void => {
    const now = Date.now();
    const elapsed = Math.max(0, Math.min(now - this.lastTick, 1000));
    this.lastTick = now;
    const active = this.allowed() && this.path && document.visibilityState === "visible" && now - this.lastInput <= IDLE_TIMEOUT;
    const activeMs = active ? elapsed : 0;
    if (activeMs) this.engagement += activeMs;
    for (const subscription of activitySubscribers) subscription.tick(activeMs);
    if (!active) this.flushActivity();
  };

  private flushActivity(): void {
    for (const subscription of activitySubscribers) subscription.flush();
    if (this.engagement > 0) this.track("engagement", { value: Math.min(30_000, Math.round(this.engagement)) });
    this.engagement = 0;
  }

  async flush(keepalive = false): Promise<void> {
    this.flushActivity();
    if (!this.allowed()) { this.clear(); return; }
    if (this.sending && !keepalive) return;
    if (!this.queue.length) return;
    this.sending = true;
    // A bounded snapshot keeps slow/failing requests from retaining an endless backlog.
    const pending = this.queue.splice(0, keepalive ? BATCH_SIZE : MAX_QUEUE);
    try {
      for (let offset = 0; offset < pending.length; offset += BATCH_SIZE) {
        if (!this.allowed()) break;
        const events = pending.slice(offset, offset + BATCH_SIZE);
        // sendBeacon always sends cookies. Keepalive fetch permits credential omission.
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          await fetch("/api/analytics", {
            method: "POST", credentials: "omit", keepalive, signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ events }),
          });
        } finally { clearTimeout(timeout); }
      }
    } catch { /* Drop failed batches. Reading and navigation always take priority. */ }
    finally { this.sending = false; }
  }

  clear(): void {
    this.queue = [];
    this.engagement = 0;
    this.session = undefined;
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* Optional storage. */ }
  }

  start(): () => void {
    activateClient(this);
    this.lastTick = Date.now();
    this.interval = setInterval(this.sample, 1000);
    this.flushInterval = setInterval(() => void this.flush(), 10_000);
    for (const event of ["pointerdown", "keydown", "scroll", "touchstart"] as const) window.addEventListener(event, this.onInput, { passive: true });
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("storage", this.onPrivacy);
    window.addEventListener(PREFERENCE_EVENT, this.onPrivacy);
    return () => {
      this.flushActivity();
      void this.flush(true);
      clearInterval(this.interval);
      clearInterval(this.flushInterval);
      for (const event of ["pointerdown", "keydown", "scroll", "touchstart"] as const) window.removeEventListener(event, this.onInput);
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("pagehide", this.onPageHide);
      window.removeEventListener("storage", this.onPrivacy);
      window.removeEventListener(PREFERENCE_EVENT, this.onPrivacy);
      if (activeClient === this) activateClient(undefined);
    };
  }
}
