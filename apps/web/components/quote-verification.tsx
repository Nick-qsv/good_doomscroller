import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  ExternalLink,
  Feather,
  FileSearch,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { AnalyticsLink, AnalyticsProofDetails } from "@/components/analytics";
import { AiPassageContext } from "@/components/ai-passage-context";
import { sourceSectionLabel } from "@/lib/source-section";
import type { PassageVerification } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});

function RecordedTime({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <span>Date not recorded</span>;
  return <time dateTime={value}>{dateFormatter.format(date)} UTC</time>;
}

export function VerificationShell({ children }: { children: ReactNode }) {
  return (
    <div className="verification-shell">
      <a className="skip-link" href="#quote-verification">Skip to verification</a>
      <header className="verification-navigation">
        <Link className="mobile-brand" href="/" aria-label="Good Doomscroller home">
          <Feather size={20} aria-hidden="true" />
          <span>good doomscroller</span>
        </Link>
        <Link className="verification-back" href="/">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to the feed
        </Link>
      </header>
      <main id="quote-verification" className="verification-page">{children}</main>
      <footer className="verification-footer">Good words. A source you can inspect. {" "}<Link href="/privacy">Privacy &amp; analytics</Link></footer>
    </div>
  );
}

function SourceLink({ href, children, passageId }: { href: string; children: ReactNode; passageId: string }) {
  try {
    if (!["https:", "http:"].includes(new URL(href).protocol)) return null;
  } catch {
    return null;
  }
  return (
    <AnalyticsLink event="source_open" passageId={passageId} className="verification-text-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={13} aria-hidden="true" />
      <span className="sr-only"> (opens in a new tab)</span>
    </AnalyticsLink>
  );
}

export function QuoteVerification({ verification }: { verification: PassageVerification }) {
  const { passage, receipt, context, downloads, anchoring } = verification;
  const verified = verification.status === "verified" && receipt && context;

  return (
    <VerificationShell>
      <header className="verification-heading">
        <p className="verification-eyebrow"><FileSearch size={15} aria-hidden="true" /> Verify quote</p>
        <h1>Words, with a source.</h1>
        <p>Follow this passage back to the book it came from.</p>
      </header>

      <section className={`verification-status${verified ? " is-verified" : ""}`} aria-labelledby="verification-status-heading">
        {verified ? <Check size={20} aria-hidden="true" /> : <BookOpen size={20} aria-hidden="true" />}
        <div>
          <h2 id="verification-status-heading">{verified ? "Exact source match" : "Not yet verified"}</h2>
          <p>{verification.message}</p>
        </div>
      </section>

      <section className="verification-section" aria-labelledby="quote-heading">
        <div className="verification-section-heading">
          <span className="verification-section-number" aria-hidden="true">01</span>
          <h2 id="quote-heading">{verified ? "Read it in context" : "The passage"}</h2>
        </div>
        <div className="verification-book-byline">
          <cite>{passage.bookTitle}</cite>
          <p>{passage.author}{passage.publicationYear ? ` · ${passage.publicationYear}` : ""}</p>
          {passage.chapterTitle ? <p className="verification-chapter">{sourceSectionLabel(passage.chapterTitle)}</p> : null}
        </div>
        {verified ? (
          <>
            <p className="verification-context-key"><span aria-hidden="true" /> The highlighted words are the passage in your feed.</p>
            <blockquote className="verification-context">
              {context.before ? <span className="verification-surrounding">{context.before}</span> : null}
              <mark aria-label="Verified passage">{context.quote}</mark>
              {context.after ? <span className="verification-surrounding">{context.after}</span> : null}
            </blockquote>
          </>
        ) : (
          <blockquote className="verification-context verification-quote-only">{passage.text}</blockquote>
        )}
        <AiPassageContext context={passage.aiContext} passageId={verification.passageId} />
      </section>

      <section className="verification-section" aria-labelledby="edition-heading">
        <div className="verification-section-heading">
          <span className="verification-section-number" aria-hidden="true">02</span>
          <h2 id="edition-heading">The source edition</h2>
        </div>
        {verified ? (
          <>
            <dl className="verification-facts">
              <div><dt>Edition from</dt><dd>{receipt.source.name}</dd></div>
              <div><dt>Version</dt><dd>{receipt.source.version || "Not specified"}</dd></div>
              <div><dt>Source retrieval date</dt><dd><RecordedTime value={receipt.source.retrievedAt} /><small>Reported by the book processing pipeline.</small></dd></div>
            </dl>
            <div className="verification-links">
              <SourceLink passageId={verification.passageId} href={receipt.source.url ?? passage.sourceUrl}>Visit the source edition</SourceLink>
              {downloads ? <AnalyticsLink event="source_download" passageId={verification.passageId} className="verification-download" href={downloads.source} download><Download size={15} aria-hidden="true" /> Download preserved book</AnalyticsLink> : null}
            </div>
            <p className="verification-explanation">The match is checked against this preserved file after consistent text cleanup. It establishes where the words appear in that edition; it does not independently authenticate the edition.</p>
          </>
        ) : (
          <>
            <p className="verification-explanation">A verified preserved source is not available for this passage. You can still inspect the declared source book.</p>
            <SourceLink passageId={verification.passageId} href={passage.sourceUrl}>Read the source book</SourceLink>
          </>
        )}
      </section>

      <section className="verification-section" aria-labelledby="trail-heading">
        <div className="verification-section-heading">
          <span className="verification-section-number" aria-hidden="true">03</span>
          <h2 id="trail-heading">The recorded trail</h2>
        </div>
        {verified ? (
          <>
            <ol className="verification-timeline">
              <li>
                <h3>Passage selection</h3>
                <p>{receipt.selection.method === "ai" || receipt.selection.model ? "AI-assisted selection" : receipt.selection.method === "manual" ? "Manual selection" : "Selected by the book processing pipeline"}</p>
                <small>Selection method is recorded; a selection time and selector identity are not.</small>
              </li>
              <li>
                <h3>Text checked against the source</h3>
                <p>The site reproduced the book text and confirmed an exact match at the recorded location.</p>
                <small><RecordedTime value={receipt.verification.checkedAt} /></small>
              </li>
              <li>
                <h3>{receipt.action === "published" ? "Published to the feed" : "Imported into the library"}</h3>
                <p>A receipt was saved with the passage and source fingerprints.</p>
                <small><RecordedTime value={receipt.recordedAt} /></small>
              </li>
            </ol>
            <p className="verification-explanation">The dates above are recorded by the site. A later blockchain anchor does not independently confirm those earlier dates.</p>
            <div className="verification-review">
              <h3>{anchoring?.status === "finalized" ? "History anchored on Polkadot" : anchoring?.status === "partial" ? "History partly anchored" : "History awaiting a blockchain anchor"}</h3>
              {anchoring?.status === "finalized" ? (
                <p>All {anchoring.totalReceipts} supplied history {anchoring.totalReceipts === 1 ? "receipt matches a finalized batch commitment" : "receipts match finalized batch commitments"} on Polkadot Hub. Download the proof to check each receipt’s inclusion.</p>
              ) : anchoring ? (
                <p>{anchoring.finalizedReceipts} of {anchoring.totalReceipts} supplied history receipts have finalized anchors. {anchoring.pendingReceipts} {anchoring.pendingReceipts === 1 ? "receipt is" : "receipts are"} waiting for a finalized batch.</p>
              ) : <p>No finalized blockchain anchor is available for this receipt.</p>}
              {anchoring?.batches.map((batch) => (
                <p key={batch.batchId}>
                  <a className="verification-text-link" href={batch.explorerUrl} target="_blank" rel="noreferrer">
                    View Polkadot block {batch.blockNumber}<ExternalLink size={13} aria-hidden="true" />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <small>Block timestamp: <RecordedTime value={batch.blockTimestamp} /></small>
                </p>
              ))}
              <p>The anchor lets you check that the supplied records match a public commitment. It does not prove every event was recorded or authenticate the book’s attribution.</p>
            </div>
            <div className="verification-review">
              <h3>Human review not recorded</h3>
              <p>This receipt records the site’s text checks. It does not include an identified uploader or a signed reviewer approval.</p>
            </div>
          </>
        ) : (
          <p className="verification-explanation">There is no verified trail to inspect here. No source match or human approval is claimed for this passage.</p>
        )}
      </section>

      {verified ? (
        <AnalyticsProofDetails passageId={verification.passageId} className="verification-proof">
          <summary>Proof details and downloads</summary>
          <div className="verification-proof-body">
            <p>These fingerprints identify the files and text used for this check. The downloadable proof lets you inspect the record and reproduce the comparison.</p>
            <dl className="verification-facts verification-fingerprints">
              <div><dt>Preserved source · SHA-256</dt><dd><code>{receipt.source.sha256}</code></dd></div>
              <div><dt>Normalized source · SHA-256</dt><dd><code>{receipt.source.normalizedSha256}</code></dd></div>
              <div><dt>Passage · SHA-256</dt><dd><code>{receipt.quote.sha256}</code></dd></div>
              <div><dt>Receipt · SHA-256</dt><dd><code>{verification.receiptSha256}</code></dd></div>
              <div><dt>Source location</dt><dd>{receipt.chapter.locator || receipt.chapter.title}<small>Characters {receipt.quote.startOffset}–{receipt.quote.endOffset} in the normalized chapter text; Unicode code points, zero-based, end exclusive.</small></dd></div>
              <div><dt>Selection method</dt><dd>{receipt.selection.method}{receipt.selection.model ? ` · ${receipt.selection.model}` : ""}</dd></div>
              <div><dt>Selection notes</dt><dd>{receipt.selection.reason}</dd></div>
              <div><dt>Processing version</dt><dd>{receipt.selection.pipelineVersion || "Not recorded"}</dd></div>
              <div><dt>Normalization version</dt><dd>{receipt.verification.normalizationVersion}</dd></div>
            </dl>
            {downloads ? <AnalyticsLink event="proof_download" passageId={verification.passageId} className="verification-download" href={downloads.proof} download><Download size={15} aria-hidden="true" /> Download verification proof</AnalyticsLink> : null}
            <p className="verification-proof-limit">{anchoring?.finalizedReceipts ? "The download includes a separate inclusion proof for each anchored receipt and identifies any pending receipts. Check the transaction, signer and finality independently on Polkadot Hub. The blockchain anchor establishes existence by its block, not the truth of earlier recorded dates." : "This receipt is maintained by the site. No finalized blockchain anchor is available yet."} No human review signature is recorded.</p>
          </div>
        </AnalyticsProofDetails>
      ) : null}
    </VerificationShell>
  );
}
