import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CookieConsentBanner, CookiePreferences } from "@/components/cookie-consent";
import { ANALYTICS_CONSENT_KEY, getAnalyticsConsent, setAnalyticsConsent } from "@/lib/analytics-client";

const router = vi.hoisted(() => ({ pathname: "/" }));
const browserPrivacyDescriptors = {
  doNotTrack: Object.getOwnPropertyDescriptor(navigator, "doNotTrack"),
  globalPrivacyControl: Object.getOwnPropertyDescriptor(navigator, "globalPrivacyControl"),
};

vi.mock("next/navigation", () => ({ usePathname: () => router.pathname }));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  router.pathname = "/";
  Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "0" });
  Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  for (const [key, descriptor] of Object.entries(browserPrivacyDescriptors)) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
});

describe("cookie consent banner", () => {
  it("offers both choices and a privacy link without saving a default", () => {
    render(<CookieConsentBanner enabled />);

    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Decline" })).toBeEnabled();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/privacy");
    expect(getAnalyticsConsent()).toBeNull();
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it.each([
    ["Accept", "accepted"],
    ["Decline", "declined"],
  ] as const)("persists %s, dismisses the banner, and remembers the choice on remount", (label, choice) => {
    const first = render(<CookieConsentBanner enabled />);
    fireEvent.click(screen.getByRole("button", { name: label }));

    expect(getAnalyticsConsent()).toBe(choice);
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).not.toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    first.unmount();
    render(<CookieConsentBanner enabled />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("responds when another tab saves or clears the choice", () => {
    render(<CookieConsentBanner enabled />);
    act(() => {
      localStorage.setItem(ANALYTICS_CONSENT_KEY, "declined");
      window.dispatchEvent(new StorageEvent("storage", { key: ANALYTICS_CONSENT_KEY }));
    });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    act(() => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent("storage", { key: null }));
    });
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("uses only the inline choices on the privacy page", () => {
    router.pathname = "/privacy";
    render(<><CookieConsentBanner enabled /><CookiePreferences enabled /></>);

    expect(screen.getAllByRole("button", { name: "Accept" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Decline" })).toHaveLength(1);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not ask for optional analytics when the deployment has them disabled", () => {
    render(<CookieConsentBanner enabled={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(getAnalyticsConsent()).toBeNull();
  });

  it("keeps the server render independent of a browser's saved choice", () => {
    expect(renderToString(<CookieConsentBanner enabled />)).not.toContain("<button");
    setAnalyticsConsent("accepted");
    expect(renderToString(<CookieConsentBanner enabled />)).not.toContain("<button");
  });
});

describe("inline cookie preferences", () => {
  it("lets readers accept and later decline, exposing the saved selection accessibly", () => {
    render(<CookiePreferences enabled />);
    const accept = screen.getByRole("button", { name: "Accept" });
    const decline = screen.getByRole("button", { name: "Decline" });
    expect(accept).toHaveAttribute("aria-pressed", "false");
    expect(decline).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(accept);
    expect(getAnalyticsConsent()).toBe("accepted");
    expect(accept).toHaveAttribute("aria-pressed", "true");
    expect(decline).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(decline);
    expect(getAnalyticsConsent()).toBe("declined");
    expect(accept).toHaveAttribute("aria-pressed", "false");
    expect(decline).toHaveAttribute("aria-pressed", "true");
  });

  it("restores a saved choice and follows changes from another tab", () => {
    setAnalyticsConsent("accepted");
    render(<CookiePreferences enabled />);
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute("aria-pressed", "true");

    act(() => {
      localStorage.setItem(ANALYTICS_CONSENT_KEY, "declined");
      window.dispatchEvent(new StorageEvent("storage", { key: ANALYTICS_CONSENT_KEY }));
    });
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Decline" })).toHaveAttribute("aria-pressed", "true");
  });

  it.each(["Do Not Track", "Global Privacy Control"])("honors %s even when a reader previously accepted", (signal) => {
    setAnalyticsConsent("accepted");
    if (signal === "Do Not Track") Object.defineProperty(navigator, "doNotTrack", { configurable: true, value: "1" });
    else Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, value: true });

    const banner = render(<CookieConsentBanner enabled />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    banner.unmount();

    render(<CookiePreferences enabled />);
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/browser|privacy|track/i);
  });

  it("does not allow enabling analytics in a disabled deployment", () => {
    render(<CookiePreferences enabled={false} />);
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(getAnalyticsConsent()).toBeNull();
  });
});
