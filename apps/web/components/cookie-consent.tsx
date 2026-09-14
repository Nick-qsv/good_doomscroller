"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import {
  browserRequestsAnalyticsPrivacy,
  getAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsPreference,
} from "@/lib/analytics-client";

function preferenceSnapshot() {
  return browserRequestsAnalyticsPrivacy() ? "browser" : getAnalyticsConsent();
}

function useCookiePreference() {
  return useSyncExternalStore(subscribeAnalyticsPreference, preferenceSnapshot, () => "pending" as const);
}

function ConsentButtons({ choice }: { choice: ReturnType<typeof useCookiePreference> }) {
  return (
    <div className="cookie-actions">
      <button type="button" className="cookie-choice" aria-pressed={choice === "declined"}
        onClick={() => setAnalyticsConsent("declined")}>
        Decline
      </button>
      <button type="button" className="cookie-choice" aria-pressed={choice === "accepted"}
        onClick={() => setAnalyticsConsent("accepted")}>
        Accept
      </button>
    </div>
  );
}

export function CookieConsentBanner({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const choice = useCookiePreference();
  if (!enabled || pathname === "/privacy" || choice !== null) return null;

  return (
    <section className="cookie-banner" aria-labelledby="cookie-consent-title">
      <h2 id="cookie-consent-title">Cookies, your choice.</h2>
      <p>Essential cookies remember your feed and reactions. Allow anonymous usage analytics to help improve the site?</p>
      <ConsentButtons choice={choice} />
      <Link className="cookie-details" href="/privacy">Privacy &amp; cookie settings</Link>
    </section>
  );
}

export function CookiePreferences({ enabled }: { enabled: boolean }) {
  const choice = useCookiePreference();
  return (
    <div className="cookie-preferences">
      <p role="status">
        {!enabled ? "Optional analytics are turned off for this site." :
          choice === "browser" ? "Your browser’s privacy setting keeps optional analytics off." :
          choice === "accepted" ? "Optional analytics are on." :
          choice === "declined" ? "Optional analytics are off." :
          choice === "pending" ? "Checking your cookie choice…" : "Optional analytics are off until you accept."}
      </p>
      {enabled && choice !== "browser" && choice !== "pending" ? <ConsentButtons choice={choice} /> : null}
      <p className="cookie-preferences-note">Essential cookies stay on. You can change your choice here anytime.</p>
    </div>
  );
}
