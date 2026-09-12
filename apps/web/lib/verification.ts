import { createHash } from "node:crypto";

import { getDatabase, isDatabaseConfigured } from "@/lib/database";
import { getPassageAnchoring } from "@/lib/anchoring";
import { demoPassages } from "@/lib/demo-data";
import type { AiContext, PassageVerification, VerificationReceipt } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

type PreservedChapter = { id: string; text: string; contentSha256: string; ordinal: number };
type VerificationRow = {
  id: string; exact_text: string; title: string; author: string; chapter_title: string | null;
  source_url: string; original_publication_year: number | null; edition_id: string;
  receipt_json: string | null; receipt_sha256: string | null;
  normalized_chapters: PreservedChapter[] | null; source_sha256: string | null;
  normalized_sha256: string | null;
  ai_context?: AiContext | null;
};

export function verificationFromRow(row: VerificationRow): PassageVerification {
  const result: PassageVerification = {
    passageId: row.id,
    status: "unavailable",
    message: "This passage has no preserved source verification record yet.",
    passage: {
      text: row.exact_text, bookTitle: row.title, author: row.author,
      chapterTitle: row.chapter_title, sourceUrl: row.source_url,
      publicationYear: row.original_publication_year,
      ...(row.ai_context ? { aiContext: row.ai_context } : {}),
    },
  };
  if (!row.receipt_json || !row.receipt_sha256 || !row.normalized_chapters) return result;
  const receipt = JSON.parse(row.receipt_json) as VerificationReceipt;
  const chapter = row.normalized_chapters.find((item) => item.id === receipt.chapter.id);
  const characters = Array.from(chapter?.text ?? "");
  const { startOffset, endOffset } = receipt.quote;
  const reconstructed = characters.slice(startOffset, endOffset).join("");
  if (
    digest(row.receipt_json) !== row.receipt_sha256 ||
    receipt.schemaVersion !== "1.0" ||
    receipt.verification.method !== "reproduced-normalization-and-exact-source-slice" ||
    receipt.verification.normalizationVersion !== "1" ||
    receipt.passageId !== row.id || receipt.book.editionId !== row.edition_id ||
    receipt.book.title !== row.title || receipt.book.authors.join(", ") !== row.author ||
    (receipt.source.url ?? receipt.source.downloadUrl) !== row.source_url ||
    receipt.action !== "published" || receipt.source.sha256 !== row.source_sha256 ||
    receipt.source.normalizedSha256 !== row.normalized_sha256 ||
    !chapter || digest(chapter.text) !== chapter.contentSha256 ||
    chapter.contentSha256 !== receipt.chapter.sha256 ||
    digest(row.normalized_chapters.map((item) => item.text).join("\n\n\n")) !== row.normalized_sha256 ||
    !Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) ||
    startOffset < 0 || endOffset <= startOffset || endOffset > characters.length ||
    receipt.quote.offsetUnit !== "unicode-code-points" ||
    reconstructed !== row.exact_text || reconstructed !== receipt.quote.text ||
    digest(reconstructed) !== receipt.quote.sha256
  ) {
    return { ...result, message: "The stored verification record did not pass its integrity check." };
  }
  return {
    ...result,
    status: "verified",
    message: "This quote matches its preserved normalized source. The original file was reprocessed before publication; source attribution and human review are separate claims.",
    receipt, receiptSha256: row.receipt_sha256, receiptJson: row.receipt_json,
    context: {
      before: characters.slice(Math.max(0, startOffset - 700), startOffset).join(""),
      quote: reconstructed,
      after: characters.slice(endOffset, endOffset + 700).join(""),
    },
    downloads: {
      proof: `/api/passages/${row.id}/verification/proof`,
      source: `/api/passages/${row.id}/verification/source`,
    },
  };
}

export async function getPassageVerification(passageId: string): Promise<PassageVerification | null> {
  const demo = demoPassages.find((item) => item.id === passageId);
  if (demo) {
    return {
      passageId, status: "unavailable",
      message: "This is a demonstration passage. No original file or verification receipt has been preserved for it.",
      passage: {
        text: demo.text, bookTitle: demo.bookTitle, author: demo.author,
        chapterTitle: demo.chapterTitle, sourceUrl: demo.sourceUrl,
        publicationYear: demo.publicationYear,
      },
    };
  }
  if (!UUID.test(passageId) || !isDatabaseConfigured()) return null;
  const sql = getDatabase();
  const rows = await sql<VerificationRow[]>`
    SELECT p.id, p.exact_text, p.ai_context, p.edition_id, b.title, b.author,
      b.original_publication_year, c.title AS chapter_title, e.source_url,
      r.receipt_json, r.receipt_sha256, s.normalized_chapters,
      s.source_sha256, s.normalized_sha256
    FROM passages p
    JOIN books b ON b.id = p.book_id
    JOIN editions e ON e.id = p.edition_id
    JOIN chapters c ON c.id = p.chapter_id
    LEFT JOIN edition_sources s ON s.edition_id = p.edition_id
    LEFT JOIN LATERAL (
      SELECT receipt_json, receipt_sha256 FROM passage_verification_receipts
      WHERE passage_id = p.id ORDER BY sequence DESC LIMIT 1
    ) r ON true
    WHERE p.id = ${passageId}::uuid AND p.status = 'published'
  `;
  if (!rows[0]) return null;
  const result = verificationFromRow(rows[0]);
  if (result.status === "verified" && result.receiptSha256) {
    result.anchoring = await getPassageAnchoring(passageId, result.receiptSha256);
  }
  return result;
}

export async function getVerificationDownload(passageId: string, kind: "proof" | "source") {
  const result = await getPassageVerification(passageId);
  if (result?.status !== "verified" || !result.receipt) return null;
  const sql = getDatabase();
  const snapshots = await sql<Array<{
    original_bytes: Buffer; normalized_chapters: unknown; normalization_version: string;
    source_file_name: string; source_kind: string; source_media_type: string; language_code: string;
  }>>`
    SELECT s.original_bytes, s.normalized_chapters, s.normalization_version,
      e.metadata->>'sourceFileName' AS source_file_name,
      e.metadata->>'sourceKind' AS source_kind,
      e.metadata->>'sourceMediaType' AS source_media_type,
      b.language_code
    FROM edition_sources s JOIN passages p ON p.edition_id = s.edition_id
    JOIN editions e ON e.id = s.edition_id
    JOIN books b ON b.id = p.book_id
    WHERE p.id = ${passageId}::uuid AND p.status = 'published'
  `;
  const snapshot = snapshots[0];
  if (!snapshot || digest(snapshot.original_bytes) !== result.receipt.source.sha256) {
    throw new Error("Preserved source failed its integrity check");
  }
  if (kind === "source") return snapshot.original_bytes;
  const history = await sql<Array<{ receipt_json: string; receipt_sha256: string }>>`
    SELECT receipt_json, receipt_sha256 FROM passage_verification_receipts
    WHERE passage_id = ${passageId}::uuid ORDER BY sequence
  `;
  let previous: string | null = null;
  for (const entry of history) {
    const saved = JSON.parse(entry.receipt_json) as VerificationReceipt;
    if (digest(entry.receipt_json) !== entry.receipt_sha256 ||
        saved.previousReceiptSha256 !== previous || saved.passageId !== passageId) {
      throw new Error("Receipt history failed its integrity check");
    }
    previous = entry.receipt_sha256;
  }
  if (previous !== result.receiptSha256) {
    throw new Error("Publication changed while the proof was being prepared; retry");
  }
  return Buffer.from(JSON.stringify({
    schemaVersion: "1.0",
    receipt: result.receipt,
    receiptJson: result.receiptJson,
    receiptSha256: result.receiptSha256,
    receiptHashAlgorithm: "SHA-256 of the exact UTF-8 receiptJson string",
    normalizationInput: {
      fileName: snapshot.source_file_name, kind: snapshot.source_kind,
      mediaType: snapshot.source_media_type, language: snapshot.language_code,
    },
    normalizedSource: {
      normalizationVersion: snapshot.normalization_version,
      offsetUnit: "unicode-code-points",
      chapterSeparator: "\n\n\n",
      chapters: snapshot.normalized_chapters,
    },
    sourceDownload: result.downloads?.source,
    history: history.map((entry) => ({ receiptJson: entry.receipt_json, receiptSha256: entry.receipt_sha256 })),
    anchoring: result.anchoring,
    limits: "The receipt records automated verification and publication. It is not a human signature or proof of source authenticity. The separate anchoring section supplies a finalized inclusion proof or explicit pending status for each receipt; independently verify its chain evidence. Anchoring does not authenticate the receipt's earlier claimed dates or prove that every event was recorded.",
  }, null, 2), "utf8");
}
