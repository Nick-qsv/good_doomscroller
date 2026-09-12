import { VerificationShell } from "@/components/quote-verification";

export default function VerificationNotFound() {
  return (
    <VerificationShell>
      <div className="verification-empty">
        <h1>Passage not found.</h1>
        <p>This passage may have been retired from the library. Return to the feed to choose another.</p>
      </div>
    </VerificationShell>
  );
}
