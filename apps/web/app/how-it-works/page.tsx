import type { Metadata } from "next";
import Link from "next/link";

import { VerificationShell } from "@/components/quote-verification";
import { VerificationLimits, VerificationSteps } from "@/components/verification-explainer";

export const metadata: Metadata = {
  title: "How it works",
  description: "How we choose quotes and what Polkadot proves.",
};

export default function HowItWorksPage() {
  return (
    <VerificationShell>
      <header className="verification-heading"><h1>How it works</h1></header>
      <section className="verification-section" aria-label="The process">
        <VerificationSteps />
        <VerificationLimits />
        <p className="verification-small">The full records stay off-chain. Download a passage’s book and proof to check them. No wallet needed.</p>
        <p>See a recorded choice: <Link href="/passages/ff132dbc-f6cd-5651-b1c2-c4c5869e480b/verification#decision-heading" prefetch={false}>Frederick Douglass</Link>.</p>
      </section>
    </VerificationShell>
  );
}
