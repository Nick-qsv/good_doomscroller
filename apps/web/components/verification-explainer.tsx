export function VerificationLimits() {
  return <p className="verification-small">An independent Polkadot check proves the record existed by its block, not that its source is authentic, its reasons are true, or its history is complete.</p>;
}

export function VerificationSteps() {
  return (
    <ol className="verification-steps">
      <li>The program finds excerpts. The assistant checks their context and chooses complete thoughts.</li>
      <li>We record a short reason when choosing, alongside the quote and source.</li>
      <li>Blockchain details show whether Polkadot holds the readable reason or only its fingerprint. Changing a record breaks the match.</li>
    </ol>
  );
}
