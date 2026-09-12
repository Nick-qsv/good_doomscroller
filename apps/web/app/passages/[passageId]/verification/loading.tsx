import { VerificationShell } from "@/components/quote-verification";

export default function LoadingVerification() {
  return (
    <VerificationShell>
      <div className="verification-empty" role="status">
        <h1>Opening the source record.</h1>
        <p>Loading the passage and its verification trail…</p>
      </div>
    </VerificationShell>
  );
}
