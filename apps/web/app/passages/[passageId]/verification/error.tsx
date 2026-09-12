"use client";

import { VerificationShell } from "@/components/quote-verification";

export default function VerificationError({ reset }: { reset: () => void }) {
  return (
    <VerificationShell>
      <div className="verification-empty" role="alert">
        <h1>The source record couldn’t load.</h1>
        <p>Verification is temporarily unavailable. Please try again.</p>
        <button className="verification-download" type="button" onClick={reset}>Try again</button>
      </div>
    </VerificationShell>
  );
}
