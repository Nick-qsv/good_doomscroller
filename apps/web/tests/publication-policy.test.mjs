// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { demoPassages } from "../lib/demo-data";
import { publicationPolicy, isApprovedEdition, isExcludedEdition } from "../scripts/publication-policy.mjs";
import { assertPublishableCorpusPlans, importCorpusPlans, validateCorpusDocument } from "../scripts/import-corpus-lib.mjs";
import fixture from "./fixtures/verified-feed.json";

const corpusDirectory = new URL("../../../corpus/published/", import.meta.url);
const load = async (slug) => JSON.parse(await readFile(new URL(`${slug}.json`, corpusDirectory), "utf8"));

describe("conservative publication rights policy", () => {
  it("allows only the reviewed exact source bundles in the packaged corpus", async () => {
    const files = (await readdir(corpusDirectory)).filter((name) => name.endsWith(".json")).sort();
    expect(files).toEqual(publicationPolicy.approvedEditions.map((entry) => `${entry.slug}.json`).sort());
    expect(files).toHaveLength(14);
    for (const approved of publicationPolicy.approvedEditions) {
      const source = await load(approved.slug);
      expect(isApprovedEdition(source.book)).toBe(true);
      expect(() => assertPublishableCorpusPlans([validateCorpusDocument(source)])).not.toThrow();
    }
  });

  it("does not treat a US public-domain declaration or synthetic fixture as rights approval", () => {
    expect(() => assertPublishableCorpusPlans([validateCorpusDocument(fixture)]))
      .toThrow(/rights-approved edition/);
  });

  it("pins identity, source bytes, normalization and canonical source rather than title alone", async () => {
    const original = (await load(publicationPolicy.approvedEditions[0].slug)).book;
    for (const mutate of [
      (book) => { book.editionId = fixture.book.editionId; },
      (book) => { book.id = fixture.book.id; },
      (book) => { book.source.sha256 = "a".repeat(64); },
      (book) => { book.source.normalizedSha256 = "b".repeat(64); },
      (book) => { book.source.url = "https://example.org/unreviewed-edition"; },
    ]) {
      const book = structuredClone(original);
      mutate(book);
      expect(isApprovedEdition(book)).toBe(false);
    }
  });

  it("has durable empty markers for every excluded edition and rejects even candidate reimport", async () => {
    expect(publicationPolicy.excludedEditions).toHaveLength(18);
    for (const excluded of publicationPolicy.excludedEditions) {
      const contents = await readFile(new URL(`../../../corpus/retired/${excluded.editionId}.retired`, import.meta.url));
      expect(contents.byteLength).toBe(0);
      expect(isExcludedEdition(excluded.editionId)).toBe(true);
    }
    const plan = validateCorpusDocument(fixture);
    plan.book.editionId = publicationPolicy.excludedEditions[0].editionId;
    let opened = false;
    await expect(importCorpusPlans({ begin: () => { opened = true; } }, [plan], { publish: false }))
      .rejects.toThrow(/retired after rights review/);
    expect(opened).toBe(false);
  });

  it("ships demo quotations only from the exact reviewed sources and ranges", async () => {
    for (const sample of demoPassages) {
      const approved = publicationPolicy.approvedEditions.find((entry) => entry.editionId === sample.editionId);
      expect(approved).toBeDefined();
      expect(sample.sourceSha256).toBe(approved.sourceSha256);
      const corpus = await load(approved.slug);
      const source = corpus.passages.find((passage) => passage.id === sample.sourcePassageId);
      expect(source).toBeDefined();
      expect(sample.text).toBe(source.text);
      expect(sample.bookTitle).toBe(corpus.book.title);
      expect(sample.author).toBe(corpus.book.authors.join(", "));
      expect(sample.sourceUrl).toBe(corpus.book.source.url);
    }
  });

  it("keeps the persistent database allowlist in sync with the importer", async () => {
    const migration = (await Promise.all(["0011_corpus_rights_policy.sql", "0013_older_candidate_approvals.sql", "0015_new_candidate_approvals.sql"].map((name) => readFile(new URL(`../../../packages/db/migrations/${name}`, import.meta.url), "utf8")))).join("\n");
    const tuples = [...migration.matchAll(/\('([0-9a-f-]{36})', '([0-9a-f-]{36})', '([0-9a-f]{64})', '([0-9a-f]{64})', '([^']+)'\)/g)]
      .map(([, editionId, bookId, sourceSha256, normalizedSha256, sourceUrl]) => ({ editionId, bookId, sourceSha256, normalizedSha256, sourceUrl }));
    expect(tuples).toEqual(publicationPolicy.approvedEditions.map(({ editionId, bookId, sourceSha256, normalizedSha256, sourceUrl }) => ({ editionId, bookId, sourceSha256, normalizedSha256, sourceUrl })));
  });
});
