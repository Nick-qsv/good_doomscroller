import { createHash } from "node:crypto";
import verifiedFeed from "./fixtures/verified-feed.json";

import { describe, expect, it } from "vitest";

import { databaseOptions } from "../scripts/database-config.mjs";
import {
  assertPublishableCorpusPlans,
  CorpusValidationError,
  importCorpusPlans,
  parseImportArguments,
  resolveInputPath,
  validateCorpusDocument,
} from "../scripts/import-corpus-lib.mjs";

function fixture() {
  const text = "A clear old sentence remains exactly where the author placed it.";
  return {
    schemaVersion: "1.0",
    pipelineVersion: "0.1.0",
    book: {
      id: "11111111-1111-5111-8111-111111111111",
      editionId: "22222222-2222-5222-8222-222222222222",
      slug: "an-old-book",
      title: "An Old Book",
      authors: ["Ada Example"],
      language: "en-US",
      source: {
        name: "Standard Ebooks",
        fileName: "an-old-book.epub",
        kind: "epub",
        mediaType: "application/epub+zip",
        url: "https://standardebooks.org/ebooks/ada-example/an-old-book",
        downloadUrl: "https://standardebooks.org/ebooks/ada-example/an-old-book/downloads/ebook.epub",
        version: "1.0.0",
        retrievedAt: "2026-08-25T12:00:00Z",
        sha256: "a".repeat(64),
        normalizedSha256: "b".repeat(64),
        rights: {
          status: "public-domain",
          jurisdiction: "US",
          basis: "Public domain in the United States.",
        },
      },
    },
    passages: [
      {
        id: "44444444-4444-5444-8444-444444444444",
        bookId: "11111111-1111-5111-8111-111111111111",
        editionId: "22222222-2222-5222-8222-222222222222",
        text,
        title: "An Old Book",
        authors: ["Ada Example"],
        wordCount: 11,
        status: "candidate",
        qualityScore: 0.87,
        chapter: {
          id: "33333333-3333-5333-8333-333333333333",
          ordinal: 1,
          title: "Chapter I",
          locator: "src/epub/text/chapter-1.xhtml",
        },
        provenance: {
          sourceSha256: "a".repeat(64),
          chapterSha256: "c".repeat(64),
          startSentenceId: "sentence_one",
          endSentenceId: "sentence_one",
          startSentenceOrdinal: 1,
          endSentenceOrdinal: 1,
          startOffset: 12,
          endOffset: 75,
          quoteSha256: createHash("sha256").update(text).digest("hex"),
        },
        curation: {
          selector: "heuristic",
          model: null,
          score: 87,
          rank: 1,
          reason: "clear and self-contained",
          themes: ["attention"],
          contentFlags: [],
        },
      },
    ],
  };
}

function verifiedFixture() {
  const value = structuredClone(verifiedFeed);
  value.passages = value.passages.slice(0, 1);
  return value;
}

const aiContext = {
  text: "The passage connects careful observation with a more sympathetic reading of others.",
  generatedBy: "AI",
  generatedAt: "2026-09-12T20:00:00.123456Z",
};

describe("corpus importer validation", () => {
  it("accepts optional AI context without changing quote text or provenance", () => {
    const input = fixture();
    expect(validateCorpusDocument(input).passages[0].aiContext).toBeUndefined();
    input.passages[0].aiContext = aiContext;
    const passage = validateCorpusDocument(input).passages[0];
    expect(passage.aiContext).toEqual(aiContext);
    expect(passage.text).toBe(input.passages[0].text);
    expect(passage.provenance).toEqual(input.passages[0].provenance);
  });

  it.each([
    null,
    [],
    {},
    { ...aiContext, text: " " },
    { ...aiContext, text: " untrimmed" },
    { ...aiContext, text: "x".repeat(601) },
    { ...aiContext, generatedBy: "human" },
    { ...aiContext, generatedBy: null },
    { ...aiContext, generatedAt: "yesterday" },
    { ...aiContext, generatedAt: "2026-09-12" },
    { ...aiContext, generatedAt: "2026-09-12T20:00:00" },
    { ...aiContext, generatedAt: "2026-02-30T20:00:00Z" },
    { ...aiContext, verified: true },
  ])("rejects malformed or misleading AI context %#", (value) => {
    const input = fixture();
    input.passages[0].aiContext = value;
    expect(() => validateCorpusDocument(input)).toThrow(/aiContext/);
  });

  it("normalizes stable IDs and deduplicates chapters", () => {
    const input = fixture();
    input.passages.push({
      ...structuredClone(input.passages[0]),
      id: "55555555-5555-5555-8555-555555555555",
      text: "Another sentence has a different and fully verified source range.",
      provenance: {
        ...input.passages[0].provenance,
        startOffset: 80,
        endOffset: 142,
        quoteSha256: createHash("sha256")
          .update("Another sentence has a different and fully verified source range.")
          .digest("hex"),
      },
    });

    const plan = validateCorpusDocument(input, "fixture.json");
    expect(plan.book.id).toBe(input.book.id);
    expect(plan.chapters).toHaveLength(1);
    expect(plan.passages).toHaveLength(2);
    expect(plan.book.source.sourceUrl).toBe(input.book.source.url);
  });

  it("rejects a quote whose digest no longer matches", () => {
    const input = fixture();
    input.passages[0].text += " Altered.";
    expect(() => validateCorpusDocument(input)).toThrow(
      /does not match the SHA-256 digest/,
    );
  });

  it("rejects foreign book IDs before opening the database", () => {
    const input = fixture();
    input.passages[0].bookId = "99999999-9999-5999-8999-999999999999";
    expect(() => validateCorpusDocument(input)).toThrow(CorpusValidationError);
    expect(() => validateCorpusDocument(input)).toThrow(/does not match book.id/);
  });

  it("requires a canonical source page before publication", () => {
    const input = fixture();
    input.book.source.url = null;
    const plan = validateCorpusDocument(input);
    expect(() => assertPublishableCorpusPlans([plan])).toThrow(
      /--publish requires book.source.url/,
    );
  });

  it("refuses to publish a work without approved public-domain rights", () => {
    const input = fixture();
    input.book.source.rights.status = "copyrighted-with-permission";
    const plan = validateCorpusDocument(input);
    expect(() => assertPublishableCorpusPlans([plan])).toThrow(
      /rights.status to be exactly public-domain/,
    );
  });

  it("requires the original file before publishing a legacy feed", () => {
    expect(() => assertPublishableCorpusPlans([validateCorpusDocument(fixture())]))
      .toThrow(/requires a verificationBundle/);
  });

  it("rejects tampered original bytes before opening the database", () => {
    const input = verifiedFixture();
    input.verificationBundle.originalSourceBase64 = Buffer.from("Fake book").toString("base64");
    expect(() => validateCorpusDocument(input)).toThrow(/original source bytes do not match/);
  });

  it("rejects unsafe or private download URLs even when the canonical source is safe", () => {
    for (const downloadUrl of [
      "javascript:alert(1)", "https://reader:private@example.org/book.txt",
      "https://example.org/book.txt?download=private", "https://example.org/book.txt#private",
    ]) {
      const input = fixture();
      input.book.source.downloadUrl = downloadUrl;
      expect(() => validateCorpusDocument(input)).toThrow(CorpusValidationError);
    }
  });

  it("reproduces normalization and rejects fabricated text even with a matching quote hash", async () => {
    const input = verifiedFixture();
    input.passages[0].text = "A counterfeit quote with a perfectly matching self-reported digest.";
    input.passages[0].provenance.quoteSha256 = createHash("sha256").update(input.passages[0].text).digest("hex");
    let opened = false;
    await expect(importCorpusPlans({ begin: () => { opened = true; } },
      [validateCorpusDocument(input)], { publish: true })).rejects.toThrow(/Source reproduction failed/);
    expect(opened).toBe(false);
  });
});

describe("corpus importer CLI", () => {
  it("accepts multiple files and an explicit publish flag", () => {
    expect(parseImportArguments(["first.json", "--publish", "second.json"])).toEqual({
      publish: true,
      replaceEditions: false,
      help: false,
      paths: ["first.json", "second.json"],
    });
  });

  it("rejects unknown options and missing paths", () => {
    expect(() => parseImportArguments(["--force"])).toThrow(/Unknown option/);
    expect(() => parseImportArguments([])).toThrow(/at least one/);
    expect(() =>
      parseImportArguments(["--replace-editions", "book.json"]),
    ).toThrow(/requires --publish/);
  });

  it("resolves repository paths from npm's original invocation directory", () => {
    expect(
      resolveInputPath(
        "corpus/published/book.json",
        { INIT_CWD: "/workspace/repository" },
        "/workspace/repository/apps/web",
      ),
    ).toBe("/workspace/repository/corpus/published/book.json");
  });
});

describe("corpus importer writes", () => {
  it("reuses unchanged publication receipts across startup imports and records changed selection facts", async () => {
    const input = verifiedFixture();
    const receipts = [];
    const persistedContexts = [];
    const transaction = (strings, ...values) => {
      const text = strings.join("?");
      if (text.includes("SELECT source_sha256")) return Promise.resolve([{
        source_sha256: input.book.source.sha256,
        normalized_sha256: input.book.source.normalizedSha256,
        normalization_version: "1",
      }]);
      if (text.includes("SELECT p.status")) return Promise.resolve(receipts.length ? [{
        status: "published", receipt_json: receipts.at(-1).json,
        receipt_sha256: receipts.at(-1).sha256,
      }] : []);
      if (text.includes("INSERT INTO passage_verification_receipts")) {
        receipts.push({ json: values[2], sha256: values[3] });
      }
      if (text.includes("INSERT INTO passages")) {
        expect(text).toContain("ai_context = EXCLUDED.ai_context");
        persistedContexts.push(values[5]);
      }
      return Promise.resolve([]);
    };
    transaction.json = (value) => value;
    const sql = { begin: async (callback) => callback(transaction) };
    await importCorpusPlans(sql, [validateCorpusDocument(input)], { publish: true });
    await importCorpusPlans(sql, [validateCorpusDocument(input)], { publish: true });
    expect(receipts).toHaveLength(1);
    const originalReceipt = structuredClone(receipts[0]);
    input.passages[0].aiContext = aiContext;
    await importCorpusPlans(sql, [validateCorpusDocument(input)], { publish: true });
    expect(persistedContexts.at(-1)).toEqual(aiContext);
    input.passages[0].aiContext = { ...aiContext, text: "A revised interpretation of the same original words." };
    await importCorpusPlans(sql, [validateCorpusDocument(input)], { publish: true });
    expect(persistedContexts.at(-1)).toEqual(input.passages[0].aiContext);
    delete input.passages[0].aiContext;
    await importCorpusPlans(sql, [validateCorpusDocument(input)], { publish: true });
    expect(persistedContexts.at(-1)).toBeNull();
    expect(receipts).toEqual([originalReceipt]);
    expect(JSON.parse(receipts[0].json)).not.toHaveProperty("aiContext");
    input.passages[0].curation.reason = "A changed selection explanation";
    await importCorpusPlans(sql, [validateCorpusDocument(input)], { publish: true });
    expect(receipts).toHaveLength(2);
    expect(JSON.parse(receipts[1].json).previousReceiptSha256).toBe(receipts[0].sha256);
  });

  it("writes every record in one transaction and publishes on request", async () => {
    const calls = [];
    const input = verifiedFixture();
    const transaction = (strings, ...values) => {
      const text = strings.join("?");
      calls.push({ text, values });
      return Promise.resolve(text.includes("SELECT source_sha256") ? [{
        source_sha256: input.book.source.sha256,
        normalized_sha256: input.book.source.normalizedSha256,
        normalization_version: "1",
      }] : []);
    };
    transaction.json = (value) => value;
    const sql = {
      begin: async (callback) => callback(transaction),
    };

    const totals = await importCorpusPlans(
      sql,
      [validateCorpusDocument(input)],
      { publish: true },
    );

    expect(totals).toEqual({
      books: 1,
      editions: 1,
      chapters: 1,
      passages: 1,
      archived: 0,
    });
    expect(calls).toHaveLength(9);
    expect(calls.map((call) => call.text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("INSERT INTO books"),
        expect.stringContaining("INSERT INTO editions"),
        expect.stringContaining("INSERT INTO chapters"),
        expect.stringContaining("INSERT INTO passages"),
      ]),
    );
    const passageCall = calls.find((call) => call.text.includes("INSERT INTO passages"));
    expect(passageCall.values).toContain(input.passages[0].id);
    expect(passageCall.values).toContain("published");
    const receiptCall = calls.find((call) => call.text.includes("INSERT INTO passage_verification_receipts"));
    const receipt = JSON.parse(receiptCall.values[2]);
    expect(receipt.quote.text).toBe(input.passages[0].text);
    expect(receipt.review.status).toBe("not-recorded");
    expect(receipt.anchor.status).toBe("not-anchored");
    expect(receiptCall.values[3]).toBe(createHash("sha256").update(receiptCall.values[2]).digest("hex"));
  });

  it("archives rows omitted from an explicitly replaced edition", async () => {
    const calls = [];
    const input = verifiedFixture();
    const transaction = (strings, ...values) => {
      const text = strings.join("?");
      calls.push({ text, values });
      return Promise.resolve(
        text.includes("SELECT source_sha256") ? [{
          source_sha256: input.book.source.sha256,
          normalized_sha256: input.book.source.normalizedSha256,
          normalization_version: "1",
        }] : text.includes("UPDATE passages") ? [{ id: "an-old-passage" }] : [],
      );
    };
    transaction.json = (value) => value;
    transaction.array = (value) => value;
    const sql = { begin: async (callback) => callback(transaction) };
    const plan = validateCorpusDocument(input);

    const totals = await importCorpusPlans(sql, [plan], {
      publish: true,
      replaceEditions: true,
    });

    expect(totals.archived).toBe(1);
    const archiveCall = calls.find((call) => call.text.includes("UPDATE passages"));
    expect(archiveCall.values).toContain(plan.book.editionId);
    expect(archiveCall.values).toContainEqual([plan.passages[0].id]);
  });
});

describe("database environment parsing", () => {
  it("supports DATABASE_URL without forcing TLS for local Postgres", () => {
    expect(databaseOptions({ DATABASE_URL: "postgresql://local/db" })).toEqual({
      url: "postgresql://local/db",
      options: { max: 1 },
    });
  });

  it("supports DB_SECRET_JSON credentials and validates the port", () => {
    const configuration = databaseOptions({
      DB_HOST: "database.internal",
      DB_NAME: "doomscroller",
      DB_PORT: "5432",
      DB_SECRET_JSON: JSON.stringify({ username: "app", password: "secret" }),
    });
    expect(configuration.options).toMatchObject({
      host: "database.internal",
      database: "doomscroller",
      username: "app",
      password: "secret",
      port: 5432,
      ssl: "require",
    });
    expect(() =>
      databaseOptions({
        DB_HOST: "database.internal",
        DB_NAME: "doomscroller",
        DB_PORT: "70000",
        DB_USER: "app",
        DB_PASSWORD: "secret",
      }),
    ).toThrow(/valid TCP port/);
  });
});
