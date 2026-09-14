import { ArrowLeft, Feather } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AnalyticsLink, AnalyticsProofDetails } from "@/components/analytics";
import { VerificationLimits } from "@/components/verification-explainer";
import { SourceLicenseNotice } from "@/components/source-license-notice";
import type { PassageVerification } from "@/lib/types";

export function VerificationShell({ children }: { children: ReactNode }) {
  return (
    <div className="verification-shell">
      <a className="skip-link" href="#quote-verification">Skip to content</a>
      <header className="verification-navigation">
        <Link className="mobile-brand" href="/" aria-label="Good Doomscroller home">
          <Feather size={20} aria-hidden="true" /><span>good doomscroller</span>
        </Link>
        <Link className="verification-back" href="/"><ArrowLeft size={15} aria-hidden="true" /> Back to feed</Link>
      </header>
      <main id="quote-verification" className="verification-page">{children}</main>
      <footer className="verification-footer"><Link href="/how-it-works">How it works</Link>{" · "}<Link href="/privacy">Privacy</Link></footer>
    </div>
  );
}

function SourceLink({ href, passageId }: { href: string; passageId: string }) {
  try {
    if (!["https:", "http:"].includes(new URL(href).protocol)) return null;
  } catch {
    return null;
  }
  return <AnalyticsLink event="source_open" passageId={passageId} href={href} target="_blank" rel="noreferrer">Source edition<span className="sr-only"> (opens in a new tab)</span></AnalyticsLink>;
}

function briefRecordedReason(reason: string) {
  const firstClause = reason.trim().split(/(?<=[.!?])\s+|;/)[0];
  if (!firstClause) return "No selection reason recorded.";
  const words = firstClause.split(/\s+/);
  return words.length > 30 ? `${words.slice(0, 30).join(" ")}…` : firstClause;
}

function SelectionDate({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return <p className="verification-small">Recorded <time dateTime={value}>{date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}</time>.</p>;
}

export function QuoteVerification({ verification }: { verification: PassageVerification }) {
  const { passage, receipt, context, downloads, anchoring } = verification;
  const verified = verification.status === "verified" && receipt && context;
  const comparison = verified && receipt.selection.decisionReview?.reviewKind === "selection-comparison"
    ? receipt.selection.decisionReview : undefined;
  const latestAnchor = anchoring?.history.find((entry) => entry.receiptSha256 === verification.receiptSha256);

  return (
    <VerificationShell>
      <header className="verification-heading"><h1>Why this quote?</h1></header>
      <SourceLicenseNotice />
      <section className="verification-section verification-passage" aria-label="Quote">
        <blockquote className="verification-quote">{passage.text}</blockquote>
        <p className="verification-byline"><cite>{passage.bookTitle}</cite> · {passage.author}</p>
        {verified && (context.before || context.after) ? (
          <details className="verification-disclosure">
            <summary>Read surrounding text</summary>
            <blockquote className="verification-context">{context.before}<mark>{context.quote}</mark>{context.after}</blockquote>
          </details>
        ) : null}
      </section>

      {verified ? (
        <>
          <section className="verification-section" aria-labelledby="decision-heading">
            <h2 id="decision-heading">Why chosen</h2>
            <p>{comparison?.whySelected ?? briefRecordedReason(receipt.selection.reason)}</p>
            {receipt.selection.selectionRecordedAt ? <SelectionDate value={receipt.selection.selectionRecordedAt} /> : null}
            {comparison ? (
              <details className="verification-disclosure">
                <summary>Compare another excerpt</summary>
                <blockquote className="verification-alternative">{comparison.alternative.text}</blockquote>
                <p>{comparison.whyAlternativeNotSelected}</p>
              </details>
            ) : null}
            {latestAnchor?.rationale?.status === "on-chain" ? (
              <details className="verification-disclosure">
                <summary>Read rationale stored on Polkadot</summary>
                <p>{latestAnchor.rationale.reason}</p>
                <p className="verification-small">This public selection summary is included in the blockchain transaction alongside the receipt hash.</p>
              </details>
            ) : latestAnchor?.rationale?.status === "hash-only" ? (
              <p className="verification-small">This older blockchain record contains a hash. Its readable rationale is saved in the receipt.</p>
            ) : null}
          </section>

          <section className="verification-section verification-checks" aria-labelledby="checks-heading">
            <h2 id="checks-heading">Check it</h2>
            <p>Matches the saved book after text cleanup.</p>
            <p>{anchoring ? `Polkadot: ${anchoring.finalizedReceipts} of ${anchoring.totalReceipts} records finalized${anchoring.pendingReceipts ? `; ${anchoring.pendingReceipts} pending` : ""}.` : "Polkadot: pending."}</p>
            <VerificationLimits />
            <div className="verification-links">
              <SourceLink passageId={verification.passageId} href={receipt.source.url ?? passage.sourceUrl} />
              {downloads ? <>
                <AnalyticsLink event="source_download" passageId={verification.passageId} href={downloads.source} download>Download book</AnalyticsLink>
                <AnalyticsLink event="proof_download" passageId={verification.passageId} href={downloads.proof} download>Download proof</AnalyticsLink>
              </> : null}
            </div>
            {anchoring?.batches.length ? (
              <AnalyticsProofDetails passageId={verification.passageId} className="verification-disclosure">
                <summary>View blockchain records</summary>
                <ul>{anchoring.batches.map((batch) => <li key={batch.batchId}><a href={batch.explorerUrl} target="_blank" rel="noreferrer">Block {batch.blockNumber}</a></li>)}</ul>
              </AnalyticsProofDetails>
            ) : null}
          </section>
        </>
      ) : (
        <section className="verification-section" aria-labelledby="unavailable-heading">
          <h2 id="unavailable-heading">Not yet verified</h2>
          <p>{verification.message}</p>
          <SourceLink passageId={verification.passageId} href={passage.sourceUrl} />
        </section>
      )}
    </VerificationShell>
  );
}
