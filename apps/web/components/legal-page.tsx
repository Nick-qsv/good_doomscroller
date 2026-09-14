import Link from "next/link";
import type { ReactNode } from "react";

export function LegalContact() {
  return <a href="mailto:contact@vrgammon.com">contact@vrgammon.com</a>;
}

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="verification-shell legal-page">
      <Link className="verification-back" href="/">← Back to the feed</Link>
      <header className="legal-heading">
        <h1>{title}</h1>
        <p>Last updated: September 13, 2026</p>
        <p>Good Doomscroller is operated by 25D94 LLC, a New York limited liability company. Contact: <LegalContact />.</p>
        <nav aria-label="Legal pages"><Link href="/privacy">Privacy &amp; cookies</Link>{" · "}<Link href="/terms">Terms of use</Link>{" · "}<Link href="/source-license">Source licensing</Link></nav>
      </header>
      <div className="legal-copy">{children}</div>
    </main>
  );
}
