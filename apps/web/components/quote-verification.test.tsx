import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { QuoteVerification } from "@/components/quote-verification";
import type { PassageAnchoring, PassageVerification, VerificationReceipt } from "@/lib/types";

const quote = "The world is full of obvious things which nobody by any chance ever observes.";
const receipt: VerificationReceipt = {
  schemaVersion: "1.0",
  action: "published",
  recordedAt: "2026-09-10T16:10:00Z",
  previousReceiptSha256: null,
  passageId: "passage-one",
  book: { id: "book-one", editionId: "edition-one", title: "The Hound of the Baskervilles", authors: ["Arthur Conan Doyle"] },
  source: {
    name: "Standard Ebooks", url: "https://standardebooks.org/ebooks/arthur-conan-doyle/the-hound-of-the-baskervilles",
    downloadUrl: null, version: "2026-09-09", retrievedAt: "2026-09-09T12:00:00Z",
    sha256: "a".repeat(64), normalizedSha256: "b".repeat(64),
  },
  chapter: { id: "chapter-one", ordinal: 1, title: "Mr. Sherlock Holmes", locator: "text/chapter-1.xhtml", sha256: "c".repeat(64) },
  quote: { text: quote, sha256: "d".repeat(64), startOffset: 8, endOffset: 8 + quote.length, offsetUnit: "unicode-code-points", startSentenceId: "sentence-2", endSentenceId: "sentence-2" },
  selection: { method: "ai", model: "selection-model", reason: "A self-contained observation.", pipelineVersion: "1.0" },
  verification: { method: "reproduced-normalization-and-exact-source-slice", normalizationVersion: "1", checkedAt: "2026-09-10T16:09:00Z" },
  review: { status: "not-recorded" },
  anchor: { status: "not-anchored" },
};

const verified: PassageVerification = {
  passageId: "passage-one",
  status: "verified",
  message: "This passage matches the preserved source text exactly.",
  passage: {
    text: quote, bookTitle: receipt.book.title, author: receipt.book.authors[0],
    chapterTitle: receipt.chapter.title, sourceUrl: receipt.source.url!, publicationYear: 1902,
  },
  receipt,
  receiptSha256: "e".repeat(64),
  context: { before: "Before. ", quote, after: " After.\nA new paragraph." },
  downloads: {
    proof: "/api/passages/passage-one/verification/proof",
    source: "/api/passages/passage-one/verification/source",
  },
};

afterEach(cleanup);

const anchored: PassageAnchoring = {
  status: "finalized", totalReceipts: 2, finalizedReceipts: 2, pendingReceipts: 0,
  verification: "local-integrity-checked-chain-evidence-recorded", history: [], limits: "Test evidence",
  batches: [{
    batchId: "batch-one", previousBatchId: null, previousRootSha256: null,
    rootSha256: "a".repeat(64), receiptCount: 2, firstReceiptSequence: "1", lastReceiptSequence: "2",
    envelopeHex: "0x00", genesisHash: "0x" + "a".repeat(64), signerAddress: "public-signer",
    blockHash: "0x" + "b".repeat(64), blockNumber: "20577500", blockTimestamp: "2026-09-12T22:00:00Z",
    extrinsicHash: "0x" + "c".repeat(64), extrinsicIndex: 2, eventIndex: 4,
    finalizedHeadHash: "0x" + "d".repeat(64), explorerUrl: "https://assethub-polkadot.subscan.io/extrinsic/20577500-2",
  }],
};

describe("quote verification", () => {
  it("shows a brief recorded reason and removes repetitive metadata", () => {
    render(<QuoteVerification verification={verified} />);
    expect(screen.getByRole("heading", { name: "Why chosen" })).toBeVisible();
    expect(screen.getByText(receipt.selection.reason)).toBeVisible();
    expect(screen.queryByText("Selection score")).not.toBeInTheDocument();
    expect(screen.queryByText(/Human review not recorded/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "/how-it-works");
  });

  it("shows prospective comparisons only and keeps the alternative optional", () => {
    const selection: VerificationReceipt["selection"] = {
      ...receipt.selection,
      selectionRecordedAt: "2026-09-13T02:00:00Z",
      decisionReview: {
        reviewedAt: "2026-09-13T02:00:00Z", reviewKind: "selection-comparison",
        summary: "The chosen passage states a complete idea.",
        alternative: { chapterId: "chapter-one", startOffset: 200, endOffset: 218, text: "He looked at them." },
        whySelected: "Its observation stands on its own.",
        whyAlternativeNotSelected: "The alternative needs more context.",
        limitation: "Selection is an editorial judgment.",
      },
    };
    const { rerender } = render(<QuoteVerification verification={{ ...verified, receipt: { ...receipt, selection } }} />);
    const decision = screen.getByRole("region", { name: "Why chosen" });
    expect(within(decision).getByText(selection.decisionReview!.whySelected)).toBeVisible();
    expect(within(decision).getByText("Sep 13, 2026")).toHaveAttribute("dateTime", selection.selectionRecordedAt);
    expect(within(decision).getByText(selection.decisionReview!.alternative.text)).not.toBeVisible();
    expect(within(decision).getByText(selection.decisionReview!.alternative.text).closest("details")).not.toHaveAttribute("open");
    rerender(<QuoteVerification verification={{ ...verified, receipt: { ...receipt, selection: {
      ...selection, decisionReview: { ...selection.decisionReview!, reviewKind: "retrospective-comparison" },
    } } }} />);
    expect(screen.queryByText("Compare another excerpt")).not.toBeInTheDocument();
    expect(screen.queryByText(selection.decisionReview!.whySelected)).not.toBeInTheDocument();
    expect(screen.getByText(receipt.selection.reason)).toBeVisible();
  });

  it("distinguishes partial and pending blockchain records from source matching", () => {
    const { rerender } = render(<QuoteVerification verification={{ ...verified, anchoring: anchored }} />);
    expect(screen.getByText("Matches the saved book after text cleanup.")).toBeVisible();
    expect(screen.getByText("Polkadot: 2 of 2 records finalized.")).toBeVisible();
    expect(screen.getByText(/not that its source is authentic/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Block 20577500", hidden: true })).toHaveAttribute("href", anchored.batches[0].explorerUrl);
    rerender(<QuoteVerification verification={{ ...verified, anchoring: { ...anchored, status: "partial", finalizedReceipts: 1, pendingReceipts: 1 } }} />);
    expect(screen.getByText("Polkadot: 1 of 2 records finalized; 1 pending.")).toBeVisible();
    rerender(<QuoteVerification verification={verified} />);
    expect(screen.getByText("Polkadot: pending.")).toBeVisible();
  });

  it("shows only the exact quote by default, with source context available on demand", () => {
    const { container } = render(<QuoteVerification verification={{ ...verified,
      passage: { ...verified.passage, chapterTitle: "CHAPTER ONE", aiContext: {
        text: "A duplicate interpretation.", generatedBy: "AI", generatedAt: "2026-09-12T20:00:00Z",
      } },
    }} />);
    expect(container.querySelector(".verification-quote")?.textContent).toBe(quote);
    expect(container.querySelector(".verification-context")?.textContent).toBe(verified.context!.before + quote + verified.context!.after);
    expect(container.querySelector(".verification-context")).not.toBeVisible();
    expect(screen.queryByText("A duplicate interpretation.")).not.toBeInTheDocument();
    expect(screen.queryByText("CHAPTER ONE")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download book" })).toHaveAttribute("href", verified.downloads!.source);
    expect(screen.getByRole("link", { name: "Download proof" })).toHaveAttribute("href", verified.downloads!.proof);
    expect(screen.getByRole("link", { name: /Source edition/ })).toHaveAttribute("href", receipt.source.url);
  });

  it("shows the full on-chain rationale and distinguishes an older hash-only record", () => {
    const history: PassageAnchoring["history"] = [{ sequence: "1", receiptSha256: verified.receiptSha256!, status: "finalized", batchId: "batch-one",
      rationale: { status: "on-chain", reason: "The full recorded public explanation; its complete text is preserved." } }];
    const { rerender } = render(<QuoteVerification verification={{ ...verified, anchoring: { ...anchored, history } }} />);
    expect(screen.getByText("Read rationale stored on Polkadot")).toBeVisible();
    expect(screen.getByText(history[0].rationale!.reason!)).not.toBeVisible();
    rerender(<QuoteVerification verification={{ ...verified, anchoring: { ...anchored,
      history: [{ ...history[0], rationale: { status: "hash-only" } }] } }} />);
    expect(screen.queryByText("Read rationale stored on Polkadot")).not.toBeInTheDocument();
    expect(screen.getByText(/This older blockchain record contains a hash/)).toBeVisible();
  });

  it("does not offer proof or claim a match when verification is unavailable", () => {
    const { container } = render(<QuoteVerification verification={{
      ...verified, status: "unavailable", message: "This sample has no preserved source record.",
    }} />);
    expect(screen.getByRole("heading", { name: "Not yet verified" })).toBeVisible();
    expect(screen.getByText(quote)).toBeVisible();
    expect(screen.queryByText("Matches the saved book after text cleanup.")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download/ })).not.toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
  });

  it("rejects executable external source links", () => {
    render(<QuoteVerification verification={{
      ...verified, status: "unavailable", passage: { ...verified.passage, sourceUrl: "javascript:alert('unsafe')" },
    }} />);
    expect(screen.queryByRole("link", { name: /Source edition/ })).not.toBeInTheDocument();
  });
});
