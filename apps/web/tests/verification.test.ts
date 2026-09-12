import { createHash } from "node:crypto";
import verifiedFeed from "./fixtures/verified-feed.json";
import { describe, expect, it } from "vitest";

import { getPassageVerification, verificationFromRow } from "@/lib/verification";
import type { VerificationReceipt } from "@/lib/types";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function storedRow() {
  const feed = structuredClone(verifiedFeed);
  const passage = feed.passages.find((item: { provenance: { startOffset: number } }) => item.provenance.startOffset > 0);
  if (!passage) throw new Error("Test fixture must include a non-initial source range");
  const receipt: VerificationReceipt = {
    schemaVersion: "1.0", action: "published", recordedAt: "2026-09-10T12:00:00Z",
    previousReceiptSha256: null, passageId: passage.id,
    book: { id: feed.book.id, editionId: feed.book.editionId, title: feed.book.title, authors: feed.book.authors },
    source: feed.book.source,
    chapter: { ...passage.chapter, sha256: passage.provenance.chapterSha256 },
    quote: {
      text: passage.text, sha256: passage.provenance.quoteSha256,
      startOffset: passage.provenance.startOffset, endOffset: passage.provenance.endOffset,
      offsetUnit: "unicode-code-points", startSentenceId: passage.provenance.startSentenceId,
      endSentenceId: passage.provenance.endSentenceId,
    },
    selection: { method: "heuristic", model: null, reason: "deterministic selection", pipelineVersion: feed.pipelineVersion },
    verification: { method: "reproduced-normalization-and-exact-source-slice", normalizationVersion: "1", checkedAt: "2026-09-10T12:00:00Z" },
    review: { status: "not-recorded" }, anchor: { status: "not-anchored" },
  };
  const receiptJson = JSON.stringify(receipt);
  return {
    id: passage.id, exact_text: passage.text, title: feed.book.title, author: "Test Author",
    chapter_title: passage.chapter.title, source_url: feed.book.source.url,
    original_publication_year: null, edition_id: feed.book.editionId,
    receipt_json: receiptJson, receipt_sha256: hash(receiptJson),
    normalized_chapters: feed.verificationBundle.chapters,
    source_sha256: feed.book.source.sha256, normalized_sha256: feed.book.source.normalizedSha256,
  };
}

describe("public quote verification", () => {
  it("exposes AI context as separate passage metadata without changing the quote receipt", () => {
    const row = storedRow();
    const baseline = verificationFromRow(row);
    const aiContext = {
      text: "An AI interpretation that is not part of the source text.",
      generatedBy: "AI" as const, generatedAt: "2026-09-12T20:00:00Z",
    };
    const result = verificationFromRow({ ...row, ai_context: aiContext });
    expect(result.passage.aiContext).toEqual(aiContext);
    expect(result.context).toEqual(baseline.context);
    expect(result.receiptJson).toBe(baseline.receiptJson);
    expect(result.receiptSha256).toBe(baseline.receiptSha256);
    expect(result.status).toBe("verified");
  });

  it("uses Unicode code points so characters before a quote cannot shift its offsets", () => {
    const row = storedRow();
    const result = verificationFromRow(row);
    expect(result.status).toBe("verified");
    expect(result.context?.quote).toBe(row.exact_text);
    expect(result.context?.before).toContain("🌟");
    expect(result.receipt?.review.status).toBe("not-recorded");
  });

  it("withholds verification if the published text, source, or receipt changes", () => {
    const row = storedRow();
    expect(verificationFromRow({ ...row, exact_text: row.exact_text + " Edited." }).status).toBe("unavailable");
    expect(verificationFromRow({ ...row, receipt_json: row.receipt_json + " " }).status).toBe("unavailable");
    const changed = structuredClone(row);
    changed.normalized_chapters[0].text += " Edited.";
    expect(verificationFromRow(changed).status).toBe("unavailable");
  });

  it("does not claim demo passages have preserved sources or receipts", async () => {
    const result = await getPassageVerification("demo-pride-prejudice-01");
    expect(result?.status).toBe("unavailable");
    expect(result?.receipt).toBeUndefined();
    expect(result?.passage.bookTitle).toBe("Pride and Prejudice");
    expect(await getPassageVerification("not-a-passage")).toBeNull();
  });
});
