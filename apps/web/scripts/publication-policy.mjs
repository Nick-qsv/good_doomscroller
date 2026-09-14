import { readFileSync } from "node:fs";

// Review decisions are tied to original and normalized bytes, not a mutable
// public-domain label or a book title. New editions require a new rights review.
export const publicationPolicy = JSON.parse(
  readFileSync(new URL("./publication-policy.json", import.meta.url), "utf8"),
);

export function isApprovedEdition(book) {
  return publicationPolicy.approvedEditions.some((approved) =>
    approved.editionId === book.editionId && approved.bookId === book.id &&
    approved.sourceSha256 === book.source.sha256 &&
    approved.normalizedSha256 === book.source.normalizedSha256 &&
    approved.sourceUrl === book.source.url,
  );
}

export function isExcludedEdition(editionId) {
  return publicationPolicy.excludedEditions.some((edition) => edition.editionId === editionId);
}
