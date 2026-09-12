export type ReactionValue = -1 | 0 | 1;

export type AiContext = {
  text: string;
  generatedBy: "AI";
  generatedAt: string;
};

export type FeedPassage = {
  id: string;
  feedToken: string;
  text: string;
  aiContext?: AiContext;
  author: string;
  bookTitle: string;
  publicationYear: number | null;
  chapterTitle: string | null;
  sourceUrl: string;
  themes: string[];
  likes: number;
  dislikes: number;
  viewerReaction: ReactionValue;
};

export type FeedResponse = {
  items: FeedPassage[];
  nextCursor: string | null;
  mode: "database" | "demo";
};

export type ReactionResponse = {
  passageId: string;
  likes: number;
  dislikes: number;
  viewerReaction: ReactionValue;
  mode: "database" | "demo";
};

export type VerificationReceipt = {
  schemaVersion: "1.0";
  action: "imported" | "published";
  recordedAt: string;
  previousReceiptSha256: string | null;
  passageId: string;
  book: { id: string; editionId: string; title: string; authors: string[] };
  source: {
    name: string; url: string | null; downloadUrl: string | null;
    version: string | null; retrievedAt: string; sha256: string; normalizedSha256: string;
  };
  chapter: { id: string; ordinal: number; title: string; locator: string; sha256: string };
  quote: {
    text: string; sha256: string; startOffset: number; endOffset: number;
    offsetUnit: "unicode-code-points"; startSentenceId: string; endSentenceId: string;
  };
  selection: { method: string; model: string | null; reason: string; pipelineVersion: string };
  verification: {
    method: "reproduced-normalization-and-exact-source-slice";
    normalizationVersion: "1"; checkedAt: string;
  };
  review: { status: "not-recorded" };
  anchor: { status: "not-anchored" };
};

export type PassageVerification = {
  passageId: string;
  status: "verified" | "unavailable";
  message: string;
  passage: Pick<FeedPassage, "text" | "aiContext" | "bookTitle" | "author" | "chapterTitle" | "sourceUrl" | "publicationYear">;
  receipt?: VerificationReceipt;
  receiptSha256?: string;
  receiptJson?: string;
  context?: { before: string; quote: string; after: string };
  downloads?: { proof: string; source: string };
};
