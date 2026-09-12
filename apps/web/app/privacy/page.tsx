import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsPreference } from "@/components/analytics";

export const metadata: Metadata = {
  title: "Privacy and usage analytics",
  description: "How Good Doomscroller measures reading activity and how to turn usage analytics off.",
};

export default function PrivacyPage() {
  return (
    <main className="verification-shell privacy-page">
      <Link className="verification-back" href="/">← Back to the feed</Link>
      <header className="verification-heading">
        <p className="verification-eyebrow">Privacy</p>
        <h1>A little context about our readers.</h1>
        <p>Usage analytics help us understand which books people discover and which parts of the site they find useful.</p>
      </header>
      <section className="verification-section">
        <h2>Your choice</h2>
        <AnalyticsPreference />
        <p>Your choice is saved in this browser. We also respect Do Not Track and Global Privacy Control. Turning analytics off does not change the feed or your reactions.</p>
      </section>
      <section className="verification-section">
        <h2>What we measure</h2>
        <p>We count page visits, the site that referred a visit, broad browser and device categories, visible passages and AI context, active time, feed depth, reactions, source links, verification tools, download clicks, and loading errors.</p>
        <p>A random session identifier groups activity in one browser tab and changes after 30 minutes without tracked activity. It is separate from the cookie used to remember your reactions. Sessions are not a count of individual people.</p>
      </section>
      <section className="verification-section">
        <h2>What stays out of analytics</h2>
        <p>Analytics do not store your name, email, raw IP address, precise location, full browser identifier, search terms, URL query strings, or the contents of anything you type. Referrers are reduced to a website hostname. We do not use advertising identifiers, session recordings, or third-party analytics scripts.</p>
        <p>Analytics are stored with the site’s own database. Reports show totals and trends. Event records are eligible for deletion after 90 days, with automatic cleanup while the site receives analytics and a separate maintenance command for quiet periods.</p>
      </section>
      <section className="verification-section">
        <h2>Remembering your reactions</h2>
        <p>The site uses a separate, essential cookie to remember which passages you have liked or disliked. Analytics do not read or attach that cookie to event records. Browser requests still reach our hosting infrastructure in the usual way.</p>
      </section>
    </main>
  );
}
