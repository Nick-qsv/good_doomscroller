import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { verifyCorpusSource } from "./verify-corpus-source.mjs";
import { isApprovedEdition, isExcludedEdition } from "./publication-policy.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export class CorpusValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CorpusValidationError";
  }
}

function fail(path, message) {
  throw new CorpusValidationError(`${path}: ${message}`);
}

function object(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value;
}

function string(value, path, { allowEmpty = false } = {}) {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    fail(path, allowEmpty ? "must be a string" : "must be a non-empty string");
  }
  return value;
}

function nullableString(value, path) {
  if (value === null) return null;
  return string(value, path, { allowEmpty: true });
}

function uuid(value, path) {
  const result = string(value, path);
  if (!UUID_PATTERN.test(result)) fail(path, "must be a UUID");
  return result.toLowerCase();
}

function sha256(value, path) {
  const result = string(value, path);
  if (!SHA256_PATTERN.test(result)) {
    fail(path, "must be a lowercase SHA-256 digest");
  }
  return result;
}

function integer(value, path, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    fail(path, `must be an integer greater than or equal to ${minimum}`);
  }
  return value;
}

function numberInRange(value, path, minimum, maximum) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(path, `must be a finite number from ${minimum} to ${maximum}`);
  }
  return value;
}

function stringArray(value, path, { nonEmpty = false } = {}) {
  if (!Array.isArray(value) || (nonEmpty && value.length === 0)) {
    fail(path, nonEmpty ? "must be a non-empty array" : "must be an array");
  }
  return value.map((item, index) => string(item, `${path}[${index}]`));
}

function dateTime(value, path) {
  const result = string(value, path);
  if (!Number.isFinite(Date.parse(result))) {
    fail(path, "must be an ISO-compatible date-time");
  }
  return result;
}

function timezoneDateTime(value, path) {
  const result = string(value, path);
  const timestamp = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(result);
  if (!timestamp || !Number.isFinite(Date.parse(result)) ||
      Number(timestamp[3]) > new Date(Date.UTC(Number(timestamp[1]), Number(timestamp[2]), 0)).getUTCDate()) {
    fail(path, "must be a valid ISO date-time with a timezone");
  }
  return result;
}

function validateDecisionReview(value, path) {
  const review = object(value, path);
  const fields = ["reviewedAt", "reviewKind", "summary", "alternative", "whySelected", "whyAlternativeNotSelected", "limitation"];
  if (Object.keys(review).some((key) => !fields.includes(key))) fail(path, "contains an unsupported field");
  if (!["selection-comparison", "retrospective-comparison"].includes(review.reviewKind)) {
    fail(`${path}.reviewKind`, "must be selection-comparison or retrospective-comparison");
  }
  const narrative = (value, field) => {
    const result = string(value, `${path}.${field}`);
    if (result !== result.trim() || Array.from(result).length > 3_000) {
      fail(`${path}.${field}`, "must be trimmed and contain 1 to 3000 characters");
    }
    return result;
  };
  const alternative = object(review.alternative, `${path}.alternative`);
  if (Object.keys(alternative).some((key) => !["chapterId", "startOffset", "endOffset", "text"].includes(key))) {
    fail(`${path}.alternative`, "contains an unsupported field");
  }
  const startOffset = integer(alternative.startOffset, `${path}.alternative.startOffset`, 0);
  const endOffset = integer(alternative.endOffset, `${path}.alternative.endOffset`, 1);
  if (!Number.isSafeInteger(startOffset) || !Number.isSafeInteger(endOffset) || endOffset <= startOffset) {
    fail(`${path}.alternative`, "must have a valid increasing range of safe integer offsets");
  }
  const text = string(alternative.text, `${path}.alternative.text`);
  if (Array.from(text).length > 10_000) fail(`${path}.alternative.text`, "must contain at most 10000 characters");
  return {
    reviewedAt: timezoneDateTime(review.reviewedAt, `${path}.reviewedAt`),
    reviewKind: review.reviewKind,
    summary: narrative(review.summary, "summary"),
    alternative: {
      chapterId: uuid(alternative.chapterId, `${path}.alternative.chapterId`),
      startOffset, endOffset, text,
    },
    whySelected: narrative(review.whySelected, "whySelected"),
    whyAlternativeNotSelected: narrative(review.whyAlternativeNotSelected, "whyAlternativeNotSelected"),
    limitation: narrative(review.limitation, "limitation"),
  };
}

function validateAiContext(value, path) {
  const context = object(value, path);
  if (Object.keys(context).some((key) => !["text", "generatedBy", "generatedAt"].includes(key))) {
    fail(path, "only text, generatedBy, and generatedAt are allowed");
  }
  const text = string(context.text, `${path}.text`);
  if (text !== text.trim() || Array.from(text).length > 600) {
    fail(`${path}.text`, "must be trimmed and contain 1 to 600 characters");
  }
  if (context.generatedBy !== "AI") fail(`${path}.generatedBy`, "must be exactly AI");
  const generatedAt = string(context.generatedAt, `${path}.generatedAt`);
  const timestamp = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(generatedAt);
  if (!timestamp || !Number.isFinite(Date.parse(generatedAt)) ||
      Number(timestamp[3]) > new Date(Date.UTC(Number(timestamp[1]), Number(timestamp[2]), 0)).getUTCDate()) {
    fail(`${path}.generatedAt`, "must be a valid ISO date-time with a timezone");
  }
  return { text, generatedBy: "AI", generatedAt };
}

function publicSourceUrl(candidate, path) {
  if (candidate === null) return null;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    fail(path, "must be an absolute URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    fail(path, "must use http or https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    fail(path, "must be a public source URL without embedded credentials, query strings, or fragments; use a canonical public URL and archive private downloads locally");
  }
  return candidate;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function validateSource(value, path) {
  const source = object(value, path);
  const rights = object(source.rights, `${path}.rights`);
  const result = {
    name: string(source.name, `${path}.name`),
    fileName: string(source.fileName, `${path}.fileName`),
    kind: string(source.kind, `${path}.kind`),
    mediaType: string(source.mediaType, `${path}.mediaType`),
    url: publicSourceUrl(nullableString(source.url, `${path}.url`), `${path}.url`),
    downloadUrl: publicSourceUrl(nullableString(source.downloadUrl, `${path}.downloadUrl`), `${path}.downloadUrl`),
    version: nullableString(source.version, `${path}.version`),
    retrievedAt: dateTime(source.retrievedAt, `${path}.retrievedAt`),
    sha256: sha256(source.sha256, `${path}.sha256`),
    normalizedSha256: sha256(
      source.normalizedSha256,
      `${path}.normalizedSha256`,
    ),
    rights: {
      status: string(rights.status, `${path}.rights.status`),
      jurisdiction: string(rights.jurisdiction, `${path}.rights.jurisdiction`),
      basis: string(rights.basis, `${path}.rights.basis`),
    },
  };

  if (!["epub", "xhtml", "text"].includes(result.kind)) {
    fail(`${path}.kind`, "must be epub, xhtml, or text");
  }
  if (basename(result.fileName) !== result.fileName || result.fileName.includes("\\")) {
    fail(`${path}.fileName`, "must be a file name without local directory paths");
  }
  result.sourceUrl = result.url ?? result.downloadUrl;
  if (!result.sourceUrl) {
    fail(path, "url or downloadUrl is required by the database edition record");
  }
  return result;
}

function validateChapter(value, path) {
  const chapter = object(value, path);
  return {
    id: uuid(chapter.id, `${path}.id`),
    ordinal: integer(chapter.ordinal, `${path}.ordinal`, 1),
    title: string(chapter.title, `${path}.title`, { allowEmpty: true }),
    locator: string(chapter.locator, `${path}.locator`, { allowEmpty: true }),
  };
}

function validatePassage(value, path, book) {
  const passage = object(value, path);
  const passageId = uuid(passage.id, `${path}.id`);
  const bookId = uuid(passage.bookId, `${path}.bookId`);
  const editionId = uuid(passage.editionId, `${path}.editionId`);
  if (bookId !== book.id) fail(`${path}.bookId`, "does not match book.id");
  if (editionId !== book.editionId) {
    fail(`${path}.editionId`, "does not match book.editionId");
  }

  const title = string(passage.title, `${path}.title`);
  if (title !== book.title) fail(`${path}.title`, "does not match book.title");
  const authors = stringArray(passage.authors, `${path}.authors`, { nonEmpty: true });
  if (!sameStrings(authors, book.authors)) {
    fail(`${path}.authors`, "does not match book.authors");
  }

  const text = string(passage.text, `${path}.text`);
  const wordCount = integer(passage.wordCount, `${path}.wordCount`, 1);
  if (passage.status !== "candidate") {
    fail(`${path}.status`, "must be candidate in pipeline output");
  }
  const qualityScore = numberInRange(
    passage.qualityScore,
    `${path}.qualityScore`,
    0,
    1,
  );
  const chapter = validateChapter(passage.chapter, `${path}.chapter`);

  const provenancePath = `${path}.provenance`;
  const provenance = object(passage.provenance, provenancePath);
  const sourceDigest = sha256(
    provenance.sourceSha256,
    `${provenancePath}.sourceSha256`,
  );
  if (sourceDigest !== book.source.sha256) {
    fail(`${provenancePath}.sourceSha256`, "does not match book.source.sha256");
  }
  const chapterSha256 = sha256(
    provenance.chapterSha256,
    `${provenancePath}.chapterSha256`,
  );
  const startSentenceId = string(
    provenance.startSentenceId,
    `${provenancePath}.startSentenceId`,
  );
  const endSentenceId = string(
    provenance.endSentenceId,
    `${provenancePath}.endSentenceId`,
  );
  const startSentenceOrdinal = integer(
    provenance.startSentenceOrdinal,
    `${provenancePath}.startSentenceOrdinal`,
    1,
  );
  const endSentenceOrdinal = integer(
    provenance.endSentenceOrdinal,
    `${provenancePath}.endSentenceOrdinal`,
    1,
  );
  if (endSentenceOrdinal < startSentenceOrdinal) {
    fail(
      `${provenancePath}.endSentenceOrdinal`,
      "must not precede startSentenceOrdinal",
    );
  }
  const startOffset = integer(
    provenance.startOffset,
    `${provenancePath}.startOffset`,
    0,
  );
  const endOffset = integer(
    provenance.endOffset,
    `${provenancePath}.endOffset`,
    1,
  );
  if (endOffset <= startOffset) {
    fail(`${provenancePath}.endOffset`, "must be greater than startOffset");
  }
  const quoteDigest = sha256(
    provenance.quoteSha256,
    `${provenancePath}.quoteSha256`,
  );
  const actualQuoteDigest = createHash("sha256").update(text, "utf8").digest("hex");
  if (quoteDigest !== actualQuoteDigest) {
    fail(
      `${provenancePath}.quoteSha256`,
      "does not match the SHA-256 digest of passage.text",
    );
  }

  const curationPath = `${path}.curation`;
  const curation = object(passage.curation, curationPath);
  const selector = string(curation.selector, `${curationPath}.selector`);
  if (selector !== "heuristic" && selector !== "openai") {
    fail(`${curationPath}.selector`, "must be heuristic or openai");
  }
  const model = nullableString(curation.model, `${curationPath}.model`);
  const selectionScore = numberInRange(
    curation.score,
    `${curationPath}.score`,
    0,
    100,
  );
  const rank = integer(curation.rank, `${curationPath}.rank`, 1);
  const reason = string(curation.reason, `${curationPath}.reason`);
  const themes = stringArray(curation.themes, `${curationPath}.themes`);
  const contentFlags = stringArray(
    curation.contentFlags,
    `${curationPath}.contentFlags`,
  );

  return {
    id: passageId,
    bookId,
    editionId,
    title,
    authors,
    text,
    ...(passage.aiContext === undefined ? {} : {
      aiContext: validateAiContext(passage.aiContext, `${path}.aiContext`),
    }),
    wordCount,
    qualityScore,
    chapter,
    provenance: {
      sourceSha256: sourceDigest,
      chapterSha256,
      startSentenceId,
      endSentenceId,
      startSentenceOrdinal,
      endSentenceOrdinal,
      startOffset,
      endOffset,
      quoteSha256: quoteDigest,
    },
    curation: {
      selector,
      model,
      score: selectionScore,
      rank,
      reason,
      themes,
      contentFlags,
      ...(curation.selectionRecordedAt === undefined ? {} : {
        selectionRecordedAt: timezoneDateTime(curation.selectionRecordedAt, `${curationPath}.selectionRecordedAt`),
      }),
      ...(curation.decisionReview === undefined ? {} : {
        decisionReview: validateDecisionReview(curation.decisionReview, `${curationPath}.decisionReview`),
      }),
    },
  };
}

export function validateCorpusDocument(value, label = "corpus") {
  const document = object(value, label);
  if (document.schemaVersion !== "1.0") {
    fail(`${label}.schemaVersion`, "must be exactly 1.0");
  }
  const pipelineVersion = string(
    document.pipelineVersion,
    `${label}.pipelineVersion`,
  );

  const rawBook = object(document.book, `${label}.book`);
  const language =
    rawBook.language === null
      ? null
      : string(rawBook.language, `${label}.book.language`);
  if (language && language.length > 16) {
    fail(`${label}.book.language`, "must contain at most 16 characters");
  }
  const book = {
    id: uuid(rawBook.id, `${label}.book.id`),
    editionId: uuid(rawBook.editionId, `${label}.book.editionId`),
    slug: string(rawBook.slug, `${label}.book.slug`),
    title: string(rawBook.title, `${label}.book.title`),
    authors: stringArray(rawBook.authors, `${label}.book.authors`, {
      nonEmpty: true,
    }),
    language,
    source: validateSource(rawBook.source, `${label}.book.source`),
  };

  if (!Array.isArray(document.passages)) {
    fail(`${label}.passages`, "must be an array");
  }

  const passageIds = new Set();
  const sourceRanges = new Set();
  const chapterOrdinals = new Map();
  const chapters = new Map();
  const passages = document.passages.map((passage, index) => {
    const path = `${label}.passages[${index}]`;
    const normalized = validatePassage(passage, path, book);
    if (passageIds.has(normalized.id)) fail(`${path}.id`, "is duplicated");
    passageIds.add(normalized.id);

    const rangeKey = `${normalized.chapter.id}:${normalized.provenance.startOffset}:${normalized.provenance.endOffset}`;
    if (sourceRanges.has(rangeKey)) {
      fail(`${path}.provenance`, "duplicates another passage source range");
    }
    sourceRanges.add(rangeKey);

    const knownChapterId = chapterOrdinals.get(normalized.chapter.ordinal);
    if (knownChapterId && knownChapterId !== normalized.chapter.id) {
      fail(
        `${path}.chapter.ordinal`,
        "is already assigned to a different chapter ID",
      );
    }
    chapterOrdinals.set(normalized.chapter.ordinal, normalized.chapter.id);

    const knownChapter = chapters.get(normalized.chapter.id);
    if (
      knownChapter &&
      (knownChapter.ordinal !== normalized.chapter.ordinal ||
        knownChapter.title !== normalized.chapter.title ||
        knownChapter.locator !== normalized.chapter.locator)
    ) {
      fail(`${path}.chapter`, "conflicts with an earlier use of this chapter ID");
    }
    chapters.set(normalized.chapter.id, normalized.chapter);
    return normalized;
  });

  let verificationBundle = null;
  if (document.verificationBundle !== undefined) {
    const bundle = object(document.verificationBundle, `${label}.verificationBundle`);
    if (bundle.version !== "1" || bundle.normalizationVersion !== "1" ||
        bundle.offsetUnit !== "unicode-code-points") {
      fail(`${label}.verificationBundle`, "has an unsupported version or offset unit");
    }
    const encoded = string(bundle.originalSourceBase64, `${label}.verificationBundle.originalSourceBase64`);
    if (encoded.length > 70 * 1024 * 1024 || encoded.length % 4 !== 0) {
      fail(`${label}.verificationBundle.originalSourceBase64`, "must be valid base64 under 70 MiB");
    }
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded) {
      fail(`${label}.verificationBundle.originalSourceBase64`, "must use canonical base64");
    }
    if (createHash("sha256").update(bytes).digest("hex") !== book.source.sha256) {
      fail(`${label}.verificationBundle`, "original source bytes do not match book.source.sha256");
    }
    if (!Array.isArray(bundle.chapters) || bundle.chapters.length === 0) {
      fail(`${label}.verificationBundle.chapters`, "must contain the preserved normalized chapters");
    }
    verificationBundle = {
      version: "1", normalizationVersion: "1", offsetUnit: "unicode-code-points",
      originalSourceBase64: encoded, chapters: bundle.chapters,
    };
  }

  for (const passage of passages) {
    const alternative = passage.curation.decisionReview?.alternative;
    if (!alternative) continue;
    const path = `${label}.passages[${passages.indexOf(passage)}].curation.decisionReview.alternative`;
    if (!verificationBundle) fail(path, "requires a preserved verificationBundle");
    const chapter = verificationBundle.chapters.find((item) => item.id === alternative.chapterId);
    if (!chapter || typeof chapter.text !== "string") fail(path, "must reference a preserved chapter in this edition");
    const codePoints = Array.from(chapter.text);
    if (alternative.endOffset > codePoints.length ||
        codePoints.slice(alternative.startOffset, alternative.endOffset).join("") !== alternative.text) {
      fail(path, "must match the exact preserved source slice at Unicode code-point offsets");
    }
    if (alternative.chapterId === passage.chapter.id &&
        alternative.startOffset === passage.provenance.startOffset &&
        alternative.endOffset === passage.provenance.endOffset) {
      fail(path, "must compare a different source range from the selected passage");
    }
  }

  return {
    schemaVersion: "1.0",
    pipelineVersion,
    book,
    chapters: [...chapters.values()].sort((left, right) => left.ordinal - right.ordinal),
    passages,
    verificationBundle,
  };
}

export function parseImportArguments(arguments_) {
  let publish = false;
  let replaceEditions = false;
  let help = false;
  const paths = [];

  for (const argument of arguments_) {
    if (argument === "--publish") {
      publish = true;
    } else if (argument === "--replace-editions") {
      replaceEditions = true;
    } else if (argument === "--help" || argument === "-h") {
      help = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else {
      paths.push(argument);
    }
  }

  if (!help && paths.length === 0) {
    throw new Error("Provide at least one pipeline feed JSON file");
  }
  if (!help && replaceEditions && !publish) {
    throw new Error("--replace-editions requires --publish");
  }
  return { publish, replaceEditions, help, paths };
}

export function resolveInputPath(path, environment = process.env, cwd = process.cwd()) {
  return resolve(environment.INIT_CWD ?? cwd, path);
}

export async function readCorpusPlan(path) {
  const absolutePath = resolveInputPath(path);
  let payload;
  try {
    payload = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`${absolutePath}: could not read valid JSON: ${error.message}`);
  }
  const plan = validateCorpusDocument(payload, absolutePath);
  // Only deliberately named public sidecars are included, never arbitrary files
  // mentioned by source text. Keep their original bytes reproducible as UTF-8.
  const stem = basename(absolutePath, ".json");
  for (const fileName of [`${stem}.md`, `${stem}-qc.md`]) {
    let bytes;
    try {
      bytes = await readFile(join(dirname(absolutePath), "notes", fileName));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    const text = bytes.toString("utf8");
    if (!bytes.length || bytes.length > 100_000 || !Buffer.from(text, "utf8").equals(bytes)) {
      fail(`notes/${fileName}`, "must contain valid UTF-8 text between 1 and 100000 bytes");
    }
    plan.editionReview = {
      fileName, text,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      statementType: "operator-assertion",
    };
    break;
  }
  return plan;
}

export function assertPublishableCorpusPlans(plans) {
  for (const plan of plans) {
    if (!plan.book.source.url) {
      throw new CorpusValidationError(
        `--publish requires book.source.url for ${plan.book.title}; ` +
          "the public feed must link to a canonical source page",
      );
    }
    if (plan.book.source.rights.status !== "public-domain") {
      throw new CorpusValidationError(
        `--publish requires book.source.rights.status to be exactly public-domain ` +
          `for ${plan.book.title}; received ${plan.book.source.rights.status}`,
      );
    }
    if (!plan.verificationBundle) {
      throw new CorpusValidationError(
        `--publish requires a verificationBundle with preserved original source for ${plan.book.title}; reprocess the book with the current pipeline`,
      );
    }
    if (!isApprovedEdition(plan.book)) {
      throw new CorpusValidationError(
        `--publish requires a rights-approved edition with the exact reviewed source bytes for ${plan.book.title}; ` +
          "a U.S. public-domain label alone does not satisfy the publication policy",
      );
    }
  }
}

function sameReceiptFacts(previous, next) {
  const facts = (receipt) => ({
    ...receipt,
    recordedAt: null,
    previousReceiptSha256: null,
    verification: { ...receipt.verification, checkedAt: null },
  });
  return JSON.stringify(facts(previous)) === JSON.stringify(facts(next));
}

// These are snapshots of the corpus's public curation fields, not a reconstruction
// of a selector's private reasoning or a new claim about when selection happened.
// Changing a snapshot appends a receipt; old receipt bytes remain untouched.
export function buildSelectionRecord(plan, passage) {
  return {
    method: passage.curation.selector,
    model: passage.curation.model,
    reason: passage.curation.reason,
    pipelineVersion: plan.pipelineVersion,
    recordingMethod: "curation-metadata-snapshot-v1",
    recordingNote: passage.curation.selectionRecordedAt
      ? "selectionRecordedAt is when the notes were written or exported, according to the curator or pipeline clock. The notes were copied into this receipt at import. Neither date independently proves when the choice happened; the blockchain timestamp is separate."
      : "This record copies the selection metadata available in the corpus at import time. It does not claim that selection or review happened at the receipt's recordedAt time.",
    score: passage.curation.score,
    qualityScore: passage.qualityScore,
    scoreMeaning: "Saved editorial ranking signals, not probabilities that the quotation or its interpretation is true. They do not measure how much a reader will learn.",
    rank: passage.curation.rank,
    rankMeaning: "The saved rank in this edition's selection metadata. It may be retained from an earlier selection; it is not a personal recommendation or a ranking of every candidate in the book.",
    themes: [...passage.curation.themes],
    contentFlags: [...passage.curation.contentFlags],
    wordCount: passage.wordCount,
    limitations: [
      "The recorded reason and labels describe editorial judgments. Preserving them does not prove that a choice was wise, unbiased, or faithful to the author's full meaning.",
      "The method label is a pipeline field. It is not independent evidence of who made the final choice; the recorded reason may describe later assistant selection or screening.",
      passage.curation.selectionRecordedAt
        ? "The local recording time is an assertion. This record preserves only the reasons and comparisons supplied with it, not a complete candidate list or model conversation."
        : "This record does not preserve the original selection time, a complete candidate list, historical rejection decisions, or a complete model conversation.",
      "An empty content-flags list means no flags were recorded; it is not a guarantee that a passage is suitable for every reader.",
    ],
    ...(passage.curation.selectionRecordedAt ? { selectionRecordedAt: passage.curation.selectionRecordedAt } : {}),
    ...(passage.curation.decisionReview ? { decisionReview: passage.curation.decisionReview } : {}),
    ...(plan.editionReview ? { editionReview: plan.editionReview } : {}),
  };
}

export async function importCorpusPlans(
  sql,
  plans,
  { publish, replaceEditions = false },
) {
  for (const plan of plans) {
    if (isExcludedEdition(plan.book.editionId)) {
      throw new CorpusValidationError(`Edition ${plan.book.editionId} was retired after rights review and cannot be reimported`);
    }
  }
  if (publish) assertPublishableCorpusPlans(plans);
  // Verify every source before opening the transaction, including candidate imports.
  for (const plan of plans) await verifyCorpusSource(plan);
  const importedAt = new Date().toISOString();
  const totals = {
    books: 0,
    editions: 0,
    chapters: 0,
    passages: 0,
    archived: 0,
  };
  const replacementPassages = new Map();
  if (replaceEditions) {
    for (const plan of plans) {
      const passageIds = replacementPassages.get(plan.book.editionId) ?? new Set();
      for (const passage of plan.passages) passageIds.add(passage.id);
      replacementPassages.set(plan.book.editionId, passageIds);
    }
  }

  await sql.begin(async (transaction) => {
    for (const plan of plans) {
      const { book } = plan;
      // Retirement and import take the same lock, including for editions that
      // do not exist yet. A stale batch cannot revive a retired source.
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${book.editionId}))`;
      const retired = await transaction`
        SELECT edition_id FROM edition_retirements WHERE edition_id = ${book.editionId}::uuid
        UNION ALL
        SELECT id FROM editions WHERE id = ${book.editionId}::uuid AND metadata ->> 'retired' = 'true'
      `;
      if (retired.length) {
        throw new CorpusValidationError(`Edition ${book.editionId} is retired and cannot be reimported`);
      }
      const author = book.authors.join(", ");
      await transaction`
        INSERT INTO books (
          id, title, author, author_sort, language_code
        ) VALUES (
          ${book.id}::uuid,
          ${book.title},
          ${author},
          ${author},
          ${book.language ?? "en"}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          author = EXCLUDED.author,
          author_sort = EXCLUDED.author_sort,
          language_code = EXCLUDED.language_code
      `;
      totals.books += 1;

      const editionMetadata = {
        schemaVersion: plan.schemaVersion,
        pipelineVersion: plan.pipelineVersion,
        slug: book.slug,
        sourceFileName: book.source.fileName,
        sourceKind: book.source.kind,
        sourceMediaType: book.source.mediaType,
        rightsStatus: book.source.rights.status,
      };
      await transaction`
        INSERT INTO editions (
          id,
          book_id,
          source_name,
          source_url,
          download_url,
          source_version,
          source_sha256,
          normalized_sha256,
          rights_basis,
          rights_jurisdiction,
          retrieved_at,
          metadata
        ) VALUES (
          ${book.editionId}::uuid,
          ${book.id}::uuid,
          ${book.source.name},
          ${book.source.sourceUrl},
          ${book.source.downloadUrl},
          ${book.source.version},
          ${book.source.sha256},
          ${book.source.normalizedSha256},
          ${book.source.rights.basis},
          ${book.source.rights.jurisdiction},
          ${book.source.retrievedAt}::timestamptz,
          ${transaction.json(editionMetadata)}
        )
        ON CONFLICT (id) DO UPDATE SET
          book_id = EXCLUDED.book_id,
          source_name = EXCLUDED.source_name,
          source_url = EXCLUDED.source_url,
          download_url = EXCLUDED.download_url,
          source_version = EXCLUDED.source_version,
          source_sha256 = EXCLUDED.source_sha256,
          normalized_sha256 = EXCLUDED.normalized_sha256,
          rights_basis = EXCLUDED.rights_basis,
          rights_jurisdiction = EXCLUDED.rights_jurisdiction,
          retrieved_at = EXCLUDED.retrieved_at,
          metadata = editions.metadata || EXCLUDED.metadata
      `;
      totals.editions += 1;

      if (plan.verificationBundle) {
        const bundle = plan.verificationBundle;
        // The edition lock above also serializes its immutable receipt chain.
        await transaction`
          INSERT INTO edition_sources (
            edition_id, source_sha256, normalized_sha256, normalization_version,
            original_bytes, normalized_chapters
          ) VALUES (
            ${book.editionId}::uuid, ${book.source.sha256}, ${book.source.normalizedSha256},
            ${bundle.normalizationVersion}, ${Buffer.from(bundle.originalSourceBase64, "base64")},
            ${transaction.json(bundle.chapters)}
          ) ON CONFLICT (edition_id) DO NOTHING
        `;
        const snapshots = await transaction`
          SELECT source_sha256, normalized_sha256, normalization_version
          FROM edition_sources WHERE edition_id = ${book.editionId}::uuid
        `;
        if (snapshots[0]?.source_sha256 !== book.source.sha256 ||
            snapshots[0]?.normalized_sha256 !== book.source.normalizedSha256 ||
            snapshots[0]?.normalization_version !== bundle.normalizationVersion) {
          throw new CorpusValidationError("The preserved edition source is immutable; use a new edition for a changed source.");
        }
      }

      for (const chapter of plan.chapters) {
        await transaction`
          INSERT INTO chapters (
            id, edition_id, chapter_index, title, source_path
          ) VALUES (
            ${chapter.id}::uuid,
            ${book.editionId}::uuid,
            ${chapter.ordinal - 1},
            ${chapter.title || null},
            ${chapter.locator || null}
          )
          ON CONFLICT (id) DO UPDATE SET
            edition_id = EXCLUDED.edition_id,
            chapter_index = EXCLUDED.chapter_index,
            title = EXCLUDED.title,
            source_path = EXCLUDED.source_path
        `;
        totals.chapters += 1;
      }

      for (const passage of plan.passages) {
        const status = publish ? "published" : "candidate";
        const publishedAt = publish ? importedAt : null;
        const prior = plan.verificationBundle ? await transaction`
          SELECT p.status, r.receipt_json, r.receipt_sha256
          FROM passages p
          LEFT JOIN LATERAL (
            SELECT receipt_json, receipt_sha256 FROM passage_verification_receipts
            WHERE passage_id = p.id ORDER BY sequence DESC LIMIT 1
          ) r ON true
          WHERE p.id = ${passage.id}::uuid
        ` : [];
        if (prior[0]?.receipt_json && createHash("sha256").update(prior[0].receipt_json, "utf8").digest("hex") !== prior[0].receipt_sha256) {
          throw new CorpusValidationError("Existing receipt failed its integrity check; publication stopped.");
        }
        await transaction`
          INSERT INTO passages (
            id,
            book_id,
            edition_id,
            chapter_id,
            exact_text,
            ai_context,
            source_start,
            source_end,
            start_sentence,
            end_sentence,
            word_count,
            quality_score,
            themes,
            content_flags,
            status,
            published_at
          ) VALUES (
            ${passage.id}::uuid,
            ${passage.bookId}::uuid,
            ${passage.editionId}::uuid,
            ${passage.chapter.id}::uuid,
            ${passage.text},
            ${passage.aiContext ? transaction.json(passage.aiContext) : null},
            ${passage.provenance.startOffset},
            ${passage.provenance.endOffset},
            ${passage.provenance.startSentenceOrdinal},
            ${passage.provenance.endSentenceOrdinal},
            ${passage.wordCount},
            ${passage.qualityScore},
            ${transaction.json(passage.curation.themes)},
            ${transaction.json(passage.curation.contentFlags)},
            ${status},
            ${publishedAt}::timestamptz
          )
          ON CONFLICT (id) DO UPDATE SET
            book_id = EXCLUDED.book_id,
            edition_id = EXCLUDED.edition_id,
            chapter_id = EXCLUDED.chapter_id,
            exact_text = EXCLUDED.exact_text,
            ai_context = EXCLUDED.ai_context,
            source_start = EXCLUDED.source_start,
            source_end = EXCLUDED.source_end,
            start_sentence = EXCLUDED.start_sentence,
            end_sentence = EXCLUDED.end_sentence,
            word_count = EXCLUDED.word_count,
            quality_score = EXCLUDED.quality_score,
            themes = EXCLUDED.themes,
            content_flags = EXCLUDED.content_flags,
            status = EXCLUDED.status,
            published_at = CASE
              WHEN EXCLUDED.status = 'published'
                THEN COALESCE(passages.published_at, EXCLUDED.published_at)
              ELSE NULL
            END
        `;
        totals.passages += 1;
        if (plan.verificationBundle) {
          const receipt = {
            schemaVersion: "1.0",
            action: publish ? "published" : "imported",
            recordedAt: importedAt,
            previousReceiptSha256: prior[0]?.receipt_sha256 ?? null,
            passageId: passage.id,
            book: { id: book.id, editionId: book.editionId, title: book.title, authors: book.authors },
            source: {
              name: book.source.name, url: book.source.url, downloadUrl: book.source.downloadUrl,
              version: book.source.version, retrievedAt: book.source.retrievedAt,
              sha256: book.source.sha256, normalizedSha256: book.source.normalizedSha256,
            },
            chapter: { ...passage.chapter, sha256: passage.provenance.chapterSha256 },
            quote: {
              text: passage.text, sha256: passage.provenance.quoteSha256,
              startOffset: passage.provenance.startOffset, endOffset: passage.provenance.endOffset,
              offsetUnit: "unicode-code-points",
              startSentenceId: passage.provenance.startSentenceId,
              endSentenceId: passage.provenance.endSentenceId,
            },
            selection: buildSelectionRecord(plan, passage),
            verification: {
              method: "reproduced-normalization-and-exact-source-slice",
              normalizationVersion: "1", checkedAt: importedAt,
            },
            review: { status: "not-recorded" },
            anchor: { status: "not-anchored" },
          };
          // Container restarts replay the same deployment asset. Preserve the
          // first publication event unless facts or actual publication state changed.
          if (prior[0]?.status === status && prior[0]?.receipt_json &&
              sameReceiptFacts(JSON.parse(prior[0].receipt_json), receipt)) continue;
          const receiptJson = JSON.stringify(receipt);
          const receiptSha256 = createHash("sha256").update(receiptJson, "utf8").digest("hex");
          await transaction`
            INSERT INTO passage_verification_receipts (
              passage_id, edition_id, receipt_json, receipt_sha256, recorded_at
            ) VALUES (
              ${passage.id}::uuid, ${book.editionId}::uuid, ${receiptJson},
              ${receiptSha256}, ${importedAt}::timestamptz
            )
          `;
        }
      }
    }

    for (const [editionId, passageIds] of replacementPassages) {
      const archived = await transaction`
        UPDATE passages
        SET status = 'archived', published_at = NULL
        WHERE edition_id = ${editionId}::uuid
          AND NOT (id = ANY(${transaction.array([...passageIds])}::uuid[]))
          AND (status <> 'archived' OR published_at IS NOT NULL)
        RETURNING id
      `;
      totals.archived += archived.length;
    }
  });

  return totals;
}
