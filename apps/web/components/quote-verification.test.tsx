import { cleanup, render, screen } from "@testing-library/react";
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
  it("shows finalized chain evidence separately from source matching and older reported dates", () => {
    render(<QuoteVerification verification={{ ...verified, anchoring: anchored }} />);
    expect(screen.getByRole("heading", { name: "Exact source match" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "History anchored on Polkadot" })).toBeVisible();
    expect(screen.getByText(/All 2 supplied history receipts match/)).toBeVisible();
    expect(screen.getByRole("link", { name: /View Polkadot block 20577500/ })).toHaveAttribute("href", anchored.batches[0].explorerUrl);
    expect(screen.getByText(/does not independently confirm those earlier dates/)).toBeVisible();
    expect(screen.queryByText(/No finalized blockchain anchor is available yet/)).not.toBeInTheDocument();
  });

  it("does not imply every supplied receipt is anchored when some remain pending", () => {
    render(<QuoteVerification verification={{ ...verified, anchoring: { ...anchored, status: "partial", finalizedReceipts: 1, pendingReceipts: 1 } }} />);
    expect(screen.getByRole("heading", { name: "History partly anchored" })).toBeVisible();
    expect(screen.getByText(/1 of 2 supplied history receipts have finalized anchors. 1 receipt is waiting/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "History anchored on Polkadot" })).not.toBeInTheDocument();
  });

  it("keeps AI interpretation outside the verified source context", () => {
    const { container } = render(<QuoteVerification verification={{ ...verified,
      passage: { ...verified.passage, aiContext: {
        text: "The speaker draws attention to everyday observation.",
        generatedBy: "AI", generatedAt: "2026-09-12T20:00:00Z",
      } },
    }} />);
    const note = screen.getByRole("note", { name: "AI context" });
    expect(note).toHaveTextContent("AI-generated interpretation; may be inaccurate.");
    expect(note.closest("blockquote")).toBeNull();
    expect(container.querySelector("mark")?.textContent).toBe(quote);
    expect(screen.getByRole("heading", { name: "Human review not recorded" })).toBeVisible();
  });

  it("shows the exact quotation in its source context with traceable downloads", () => {
    const { container } = render(<QuoteVerification verification={verified} />);
    expect(screen.getByRole("heading", { name: "Exact source match" })).toBeVisible();
    const context = container.querySelector("blockquote");
    expect(context?.textContent).toBe(verified.context!.before + quote + verified.context!.after);
    expect(context?.querySelector("mark")?.textContent).toBe(quote);
    expect(screen.getByRole("link", { name: "Download preserved book" })).toHaveAttribute("href", verified.downloads!.source);
    expect(screen.getByRole("link", { name: /Visit the source edition/ })).toHaveAttribute("href", receipt.source.url);
    expect(container.querySelector("details")?.textContent).toContain(receipt.source.sha256);
    expect(container.querySelector("details a")?.getAttribute("href")).toBe(verified.downloads!.proof);
  });

  it("distinguishes recorded site actions from unrecorded review and blockchain evidence", () => {
    render(<QuoteVerification verification={verified} />);
    expect(screen.getByRole("heading", { name: "Published to the feed" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Human review not recorded" })).toBeVisible();
    expect(screen.getByText(/a selection time and selector identity are not/)).toBeVisible();
    expect(screen.getByText(/No finalized blockchain anchor is available yet/)).toBeInTheDocument();
    expect(screen.getByText(/does not independently confirm those earlier dates/)).toBeVisible();
    expect(screen.queryByText(/Uploaded by/)).not.toBeInTheDocument();
  });

  it("does not label a demo or failed verification as verified or offer proof downloads", () => {
    const { container } = render(<QuoteVerification verification={{
      ...verified,
      status: "unavailable",
      message: "This sample has no preserved source record.",
    }} />);
    expect(screen.getByRole("heading", { name: "Not yet verified" })).toBeVisible();
    expect(screen.getByText(quote)).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Exact source match" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Download/ })).not.toBeInTheDocument();
    expect(container.querySelector("mark")).toBeNull();
    expect(container.querySelector("time")).toBeNull();
    expect(container.querySelector("details")).toBeNull();
  });

  it("does not render executable or malformed external source links", () => {
    render(<QuoteVerification verification={{
      ...verified,
      status: "unavailable",
      passage: { ...verified.passage, sourceUrl: "javascript:alert('unsafe')" },
    }} />);
    expect(screen.queryByRole("link", { name: /Read the source book/ })).not.toBeInTheDocument();
  });
});
