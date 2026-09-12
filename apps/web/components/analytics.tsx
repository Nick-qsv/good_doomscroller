"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from "react";

import {
  AnalyticsClient,
  analyticsOptedOut,
  browserRequestsAnalyticsPrivacy,
  setAnalyticsOptOut,
  subscribeAnalyticsActivity,
  subscribeAnalyticsPreference,
  trackAnalytics,
  type AnalyticsEventName,
} from "@/lib/analytics-client";

export function AnalyticsProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(() => new AnalyticsClient(enabled));
  useEffect(() => client.start(), [client]);
  useEffect(() => client.setPage(pathname), [client, pathname]);
  return children;
}

/** Count a view after one second of meaningful exposure; long cards remain measurable. */
export function useAnalyticsExposure<T extends HTMLElement>(
  name: "passage_view" | "ai_context_view",
  passageId: string | undefined,
  position?: number,
) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !passageId || typeof IntersectionObserver === "undefined") return;
    let intersecting = false;
    let seen = false;
    let continuous = 0;
    let reading = 0;
    let lastExposureSample: number | null = null;
    const flush = () => {
      if (name === "passage_view" && seen && reading > 0) {
        trackAnalytics("passage_read", { passageId, value: Math.min(30_000, Math.round(reading)) });
      }
      reading = 0;
    };
    // IntersectionObserver cheaply rejects offscreen cards. Checking the rectangle
    // each sample avoids impossible percentage thresholds on very tall passages.
    const isExposed = () => {
      const rect = intersecting ? element.getBoundingClientRect() : null;
      const visibleHeight = rect ? Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0) : 0;
      return rect && rect.height > 0 && rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth &&
        visibleHeight >= Math.min(rect.height / 2, window.innerHeight / 2);
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = Boolean(entry?.isIntersecting);
      if (!intersecting) {
        continuous = 0;
        lastExposureSample = null;
        flush();
      } else if (isExposed() && lastExposureSample === null) lastExposureSample = Date.now();
    });
    observer.observe(element);
    const unsubscribe = subscribeAnalyticsActivity((activeMs) => {
      if (!activeMs || !isExposed()) {
        continuous = 0;
        lastExposureSample = null;
        flush();
        return;
      }
      const now = Date.now();
      const measuredMs = lastExposureSample === null ? 0 : Math.max(0, Math.min(activeMs, now - lastExposureSample));
      lastExposureSample = now;
      continuous += measuredMs;
      if (!seen && continuous >= 1000) {
        seen = true;
        trackAnalytics(name, { passageId, ...(name === "passage_view" ? { value: position ?? 1 } : {}) });
      }
      if (name === "passage_view") {
        reading += measuredMs;
        if (reading >= 10_000) flush();
      }
    }, flush);
    return () => { unsubscribe(); observer.disconnect(); };
  }, [name, passageId, position]);
  return ref;
}

export function AnalyticsImpression({ passageId, children, ...props }: HTMLAttributes<HTMLDivElement> & { passageId?: string }) {
  const ref = useAnalyticsExposure<HTMLDivElement>("ai_context_view", passageId);
  return <div {...props} ref={ref}>{children}</div>;
}

export function AnalyticsLink({ event, passageId, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & {
  event: AnalyticsEventName;
  passageId: string;
}) {
  return <a {...props} onClick={(click) => {
    props.onClick?.(click);
    if (!click.defaultPrevented) trackAnalytics(event, { passageId });
  }}>{children}</a>;
}

export function AnalyticsProofDetails({ passageId, children, className }: {
  passageId: string;
  children: ReactNode;
  className?: string;
}) {
  return <details className={className} onToggle={(event) => {
    if (event.currentTarget.open) trackAnalytics("proof_expand", { passageId });
  }}>{children}</details>;
}

function preferenceSnapshot() {
  return browserRequestsAnalyticsPrivacy() ? "browser" : analyticsOptedOut() ? "off" : "on";
}

export function AnalyticsPreference() {
  const preference = useSyncExternalStore(subscribeAnalyticsPreference, preferenceSnapshot, () => "pending");
  return (
    <div className="analytics-preference">
      <p role="status">
        {preference === "browser" ? "Your browser’s privacy preference disables usage analytics." :
          preference === "off" ? "Usage analytics are disabled in this browser." :
          preference === "pending" ? "Checking your analytics preference…" : "Anonymous usage analytics are allowed in this browser."}
      </p>
      <button type="button" className="verification-download" disabled={preference === "pending" || preference === "browser"}
        onClick={() => setAnalyticsOptOut(preference !== "off")}>
        {preference === "off" ? "Enable usage analytics" : "Disable usage analytics"}
      </button>
    </div>
  );
}
