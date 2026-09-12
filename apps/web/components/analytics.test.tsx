import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AnalyticsImpression, AnalyticsPreference, AnalyticsProofDetails, useAnalyticsExposure } from "@/components/analytics";
import { AnalyticsClient, ANALYTICS_OPT_OUT_KEY, externalReferrerHostname, setAnalyticsOptOut, type AnalyticsEvent } from "@/lib/analytics-client";

let stop: (() => void) | undefined;
let fetchMock: ReturnType<typeof vi.fn>;
let intersectionCallback: IntersectionObserverCallback;

function recordedEvents(): AnalyticsEvent[] {
  return fetchMock.mock.calls.flatMap(([, request]) => JSON.parse(request.body).events);
}

function start(path = "/", enabled = true) {
  const client = new AnalyticsClient(enabled);
  stop = client.start();
  client.setPage(path);
  return client;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-12T12:00:00Z"));
  localStorage.clear();
  sessionStorage.clear();
  setAnalyticsOptOut(false);
  fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersectionCallback = callback; }
    observe() {}
    disconnect() {}
  });
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "0" });
  Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("anonymous analytics transport", () => {
  it("sends only supported pages, strips query strings, and omits actor cookies", async () => {
    const client = start("/?private=do-not-store#quote");
    client.track("feed_load", { value: 6 });
    await client.flush();
    expect(recordedEvents().map((event) => event.name)).toEqual(["page_view", "feed_load"]);
    expect(recordedEvents().every((event) => event.path === "/")).toBe(true);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", method: "POST" });
    client.setPage("/admin/analytics");
    client.track("feed_load", { value: 6 });
    await client.flush();
    expect(recordedEvents()).toHaveLength(2);
  });

  it("never transmits referrer paths, search terms, credentials, or local referrals", () => {
    expect(externalReferrerHostname("https://reader:password@search.example/path?q=private#secret", "site.example")).toBe("search.example");
    expect(externalReferrerHostname("https://site.example/secret", "site.example")).toBeUndefined();
    expect(externalReferrerHostname("javascript:alert(1)", "site.example")).toBeUndefined();
  });

  it.each(["dnt", "gpc", "local", "disabled"])("does not identify or send events with %s optout", async (privacy) => {
    if (privacy === "dnt") Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
    if (privacy === "gpc") Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });
    if (privacy === "local") setAnalyticsOptOut(true);
    const client = start("/", privacy !== "disabled");
    client.track("feed_load", { value: 6 });
    await client.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("discards queued events immediately when a reader opts out", async () => {
    const client = start();
    client.track("feed_load", { value: 6 });
    setAnalyticsOptOut(true);
    await client.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
  });

  it("rotates the session after thirty minutes without events", async () => {
    const client = start();
    await client.flush();
    const first = recordedEvents()[0].sessionId;
    vi.setSystemTime(new Date("2026-09-12T12:31:00Z"));
    client.track("feed_load", { value: 6 });
    await client.flush();
    expect(recordedEvents()[1].sessionId).not.toBe(first);
    expect(recordedEvents()[1]).toMatchObject({ name: "page_view", path: "/" });
    expect(recordedEvents()[2].sessionId).toBe(recordedEvents()[1].sessionId);
    expect(recordedEvents()[1].id).not.toBe(recordedEvents()[0].id);
  });

  it("bounds the backlog and batches, while swallowing transport failure", async () => {
    const client = start();
    for (let i = 0; i < 150; i++) client.track("feed_load", { value: 6 });
    await client.flush();
    expect(recordedEvents()).toHaveLength(100);
    expect(fetchMock.mock.calls.every(([, request]) => JSON.parse(request.body).events.length <= 20)).toBe(true);
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    client.track("feed_load", { value: 6 });
    await expect(client.flush()).resolves.toBeUndefined();
  });

  it("records the external referrer only on the initial page view", async () => {
    Object.defineProperty(document, "referrer", { configurable: true, value: "https://search.example/search?q=private" });
    const client = start();
    client.setPage("/passages/demo-passage-one/verification/");
    await client.flush();
    expect(recordedEvents()[0].referrer).toBe("search.example");
    expect(recordedEvents()[1]).toMatchObject({ path: "/passages/demo-passage-one/verification" });
    expect(recordedEvents()[1].referrer).toBeUndefined();
    Object.defineProperty(document, "referrer", { configurable: true, value: "" });
  });

  it("aborts stalled requests so the next batch can proceed", async () => {
    const client = start();
    fetchMock.mockImplementationOnce((url, request) => new Promise((resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    const stalled = client.flush();
    await vi.advanceTimersByTimeAsync(5000);
    await stalled;
    client.track("feed_load", { value: 6 });
    await client.flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("flushes on pagehide with credential-free keepalive", () => {
    start();
    window.dispatchEvent(new Event("pagehide"));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", keepalive: true });
  });

  it("caps reading at sixty idle seconds and excludes hidden-tab time", async () => {
    const client = start();
    await vi.advanceTimersByTimeAsync(70_000);
    await client.flush();
    const elapsed = () => recordedEvents().filter((event) => event.name === "engagement").reduce((sum, event) => sum + (event.value ?? 0), 0);
    expect(elapsed()).toBe(60_000);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(elapsed()).toBe(60_000);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(5000);
    await client.flush();
    expect(elapsed()).toBe(65_000);
  });
});

describe("reader exposure and preferences", () => {
  function Passage() {
    const ref = useAnalyticsExposure<HTMLElement>("passage_view", "demo-passage-one", 7);
    return <article ref={ref}>Long passage</article>;
  }

  function showElement(element: Element, height = 2000) {
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ top: 0, bottom: height, left: 0, right: 600, height, width: 600, x: 0, y: 0, toJSON() {} });
    intersectionCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
  }

  it("counts a tall passage only when exposed, then sends incremental reading time", async () => {
    const client = start();
    render(<Passage />);
    await vi.advanceTimersByTimeAsync(1000);
    await client.flush();
    expect(recordedEvents().some((event) => event.name === "passage_view")).toBe(false);
    showElement(screen.getByRole("article"));
    await vi.advanceTimersByTimeAsync(1000);
    await client.flush();
    expect(recordedEvents()).toContainEqual(expect.objectContaining({ name: "passage_view", passageId: "demo-passage-one", value: 7 }));
    expect(recordedEvents()).toContainEqual(expect.objectContaining({ name: "passage_read", value: 1000 }));
    await vi.advanceTimersByTimeAsync(2000);
    await client.flush();
    expect(recordedEvents().filter((event) => event.name === "passage_view")).toHaveLength(1);
    expect(recordedEvents().filter((event) => event.name === "passage_read").map((event) => event.value)).toEqual([1000, 2000]);
  });

  it("counts AI context visibility as an impression without an expansion action", async () => {
    const client = start();
    render(<AnalyticsImpression passageId="demo-passage-one" role="note">AI context</AnalyticsImpression>);
    showElement(screen.getByRole("note"), 180);
    await vi.advanceTimersByTimeAsync(1000);
    await client.flush();
    expect(recordedEvents().filter((event) => event.name === "ai_context_view")).toHaveLength(1);
    expect(recordedEvents().filter((event) => event.name === "passage_read")).toHaveLength(0);
  });

  it("records proof opening and supports a visible analytics optout", async () => {
    const client = start("/passages/demo-passage-one/verification");
    const { container } = render(<><AnalyticsProofDetails passageId="demo-passage-one"><summary>Proof details</summary>Proof</AnalyticsProofDetails><AnalyticsPreference /></>);
    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await client.flush();
    expect(recordedEvents()).toContainEqual(expect.objectContaining({ name: "proof_expand", passageId: "demo-passage-one" }));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Disable usage analytics" })));
    expect(localStorage.getItem(ANALYTICS_OPT_OUT_KEY)).toBe("true");
    expect(screen.getByRole("status")).toHaveTextContent("disabled in this browser");
  });
});
