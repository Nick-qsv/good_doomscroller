// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { getDatabaseFeed } from "@/lib/database";
import { getDatabaseLibrary } from "@/lib/library";

// A dedicated disposable local database only; never read the application's
// DATABASE_URL or connect this destructive fixture setup to a deployed database.
const databaseUrl = process.env.FEED_TEST_DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) || parsed.pathname !== "/feed_test") {
    throw new Error("Feed integration tests require a dedicated local feed_test database");
  }
}

describe.skipIf(!databaseUrl)("fresh feed PostgreSQL integration", () => {
  const sql = postgres(databaseUrl ?? "postgres://localhost/feed_test", {
    max: 4, connect_timeout: 3, onnotice: () => {},
  });
  let migration: string;
  const migrationDirectory = new URL("../../../packages/db/migrations/", import.meta.url);

  async function migrate(source: string) {
    const connection = await sql.reserve();
    try { await connection.unsafe(source); } finally { connection.release(); }
  }

  beforeAll(async () => {
    for (const name of ["0001_initial.sql", "0003_ai_context.sql", "0007_feed_history.sql", "0008_feed_filters.sql", "0011_corpus_rights_policy.sql"]) {
      migration = await readFile(new URL(name, migrationDirectory), "utf8");
      await migrate(migration);
    }
  });
  beforeEach(async () => {
    globalThis.__goodDoomscrollerDatabase = sql;
    await sql`TRUNCATE books, actors CASCADE`;
    await sql`
      INSERT INTO books (id, title, author)
      SELECT md5('book-' || n)::uuid, 'Book ' || n, 'Author ' || (n % 3)
      FROM generate_series(1, 6) n
    `;
    await sql`
      INSERT INTO editions (id, book_id, source_url, source_sha256, normalized_sha256, rights_basis, retrieved_at)
      SELECT md5('edition-' || n)::uuid, md5('book-' || n)::uuid,
        'https://example.test/book/' || n, repeat('a', 64), repeat('b', 64), 'Synthetic test content', now()
      FROM generate_series(1, 6) n
    `;
    // Explicit synthetic approvals exist only in this disposable local database.
    // No fixture exemption is present in the production publication policy.
    await sql`
      INSERT INTO corpus_publication_approvals
        (edition_id, book_id, source_url, source_sha256, normalized_sha256, policy_version)
      SELECT id, book_id, source_url, source_sha256, normalized_sha256, 'synthetic-feed-test'
      FROM editions WHERE source_url LIKE 'https://example.test/book/%'
      ON CONFLICT (edition_id) DO NOTHING
    `;
    await sql`
      INSERT INTO chapters (id, edition_id, chapter_index)
      SELECT md5('chapter-' || n)::uuid, md5('edition-' || n)::uuid, 0
      FROM generate_series(1, 6) n
    `;
    await sql`
      INSERT INTO passages (id, book_id, edition_id, chapter_id, exact_text,
        source_start, source_end, word_count, status, published_at, themes)
      SELECT md5('passage-' || book || '-' || passage)::uuid,
        md5('book-' || book)::uuid, md5('edition-' || book)::uuid,
        md5('chapter-' || book)::uuid, 'Passage ' || passage || ' from book ' || book,
        passage * 100, passage * 100 + 30, 6, 'published', now(),
        jsonb_build_array(CASE WHEN passage % 2 = 0 THEN 'society' ELSE 'nature' END)
      FROM generate_series(1, 6) book CROSS JOIN generate_series(1, 4) passage
    `;
  });
  afterAll(async () => {
    globalThis.__goodDoomscrollerDatabase = undefined;
    await sql.end({ timeout: 3 });
  });

  it("hides unapproved existing passages from the library and cursor replay and blocks republication", async () => {
    const actor = randomUUID();
    const cursor = randomUUID();
    const first = await getDatabaseFeed(actor, cursor, 6);
    const removedPassage = first.items[0];
    await sql`
      DELETE FROM corpus_publication_approvals
      WHERE edition_id = (SELECT edition_id FROM passages WHERE id = ${removedPassage.id}::uuid)
    `;
    const second = await getDatabaseFeed(actor, cursor, 6);
    expect(second.items.some((passage) => passage.id === removedPassage.id)).toBe(false);
    expect(second.totalPublished).toBe(20);
    expect((await getDatabaseLibrary()).books.some((book) => book.title === removedPassage.bookTitle)).toBe(false);
    await expect(sql`UPDATE passages SET status = 'published' WHERE id = ${removedPassage.id}::uuid`)
      .rejects.toThrow(/not approved for publication/);
  });

  it("pins the source identity of approved editions and permanently preserves absent-edition retirements", async () => {
    await expect(sql`UPDATE editions SET source_sha256 = repeat('c', 64)
      WHERE id = md5('edition-1')::uuid`).rejects.toThrow(/source hashes cannot change/);
    const futureEdition = randomUUID();
    await sql`INSERT INTO edition_retirements (edition_id, reason)
      VALUES (${futureEdition}::uuid, 'Synthetic test retirement')`;
    await expect(sql`DELETE FROM edition_retirements WHERE edition_id = ${futureEdition}::uuid`)
      .rejects.toThrow(/retirements are permanent/);
    expect((await sql`SELECT edition_id FROM edition_retirements WHERE edition_id = ${futureEdition}::uuid`)).toHaveLength(1);
  });

  it("migrates repeatedly and stores only the latest page plus one history row per served passage", async () => {
    await migrate(migration);
    const actor = randomUUID();
    await getDatabaseFeed(actor, randomUUID(), 6);
    await getDatabaseFeed(actor, randomUUID(), 6);
    expect((await sql`SELECT count(*)::integer AS count FROM actor_feed_pages`)[0].count).toBe(1);
    expect((await sql`SELECT count(*)::integer AS count FROM actor_passage_history`)[0].count).toBe(12);
    expect((await sql`SELECT count(*)::integer AS count FROM schema_migrations WHERE version = '0007_feed_history'`)[0].count).toBe(1);
  });

  it("remembers separate visits until the library is exhausted, then continues from oldest history", async () => {
    const actor = randomUUID();
    const seen = new Set<string>();
    let oldest: string[] = [];
    for (let visit = 0; visit < 4; visit += 1) {
      const page = await getDatabaseFeed(actor, randomUUID(), 6);
      expect(page.items).toHaveLength(6);
      expect(page.revisited).toBe(false);
      expect(page.nextCursor).not.toBeNull();
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      if (visit === 0) oldest = page.items.map((item) => item.id);
    }
    const again = await getDatabaseFeed(actor, randomUUID(), 6);
    expect(again.revisited).toBe(true);
    expect(again.nextCursor).not.toBeNull();
    expect(again.items.map((item) => item.id).sort()).toEqual(oldest.sort());
  });

  it("spreads authors and books while keeping the remaining unseen items first", async () => {
    const actor = randomUUID();
    const first = await getDatabaseFeed(actor, randomUUID(), 20);
    expect(new Set(first.items.slice(0, 3).map((item) => item.author)).size).toBe(3);
    expect(new Set(first.items.slice(0, 6).map((item) => item.bookTitle)).size).toBe(6);
    const second = await getDatabaseFeed(actor, first.nextCursor!, 6);
    const seen = new Set(first.items.map((item) => item.id));
    expect(second.items.slice(0, 4).every((item) => !seen.has(item.id))).toBe(true);
    expect(second.items.slice(4).every((item) => seen.has(item.id))).toBe(true);
    expect(second.revisited).toBe(true);
  });

  it("replays concurrent retries without consuming the next unseen page", async () => {
    const actor = randomUUID();
    const cursor = randomUUID();
    const [first, retry] = await Promise.all([
      getDatabaseFeed(actor, cursor, 6), getDatabaseFeed(actor, cursor, 6),
    ]);
    expect(retry).toEqual(first);
    const next = await getDatabaseFeed(actor, first.nextCursor!, 6);
    expect(new Set([...first.items, ...next.items].map((item) => item.id)).size).toBe(12);
    expect((await sql`SELECT count(*)::integer AS count FROM actor_passage_history`)[0].count).toBe(12);
  });

  it("serializes independent overlapping requests from the same browser", async () => {
    const actor = randomUUID();
    const [first, second] = await Promise.all([
      getDatabaseFeed(actor, randomUUID(), 6), getDatabaseFeed(actor, randomUUID(), 6),
    ]);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(12);
  });

  it("keeps a tiny library endless without duplicate cards inside a page", async () => {
    await sql`UPDATE passages SET status = 'archived' WHERE id NOT IN (SELECT id FROM passages ORDER BY id LIMIT 2)`;
    const actor = randomUUID();
    const first = await getDatabaseFeed(actor, randomUUID(), 6);
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await getDatabaseFeed(actor, first.nextCursor!, 6);
    expect(second.items).toHaveLength(2);
    expect(second.revisited).toBe(true);
    expect(new Set([...first.items, ...second.items].map((item) => item.feedToken)).size).toBe(4);
  });

  it("prioritizes newly published passages after a full pass", async () => {
    const [withheld] = await sql`SELECT id FROM passages LIMIT 1`;
    await sql`UPDATE passages SET status = 'archived' WHERE id = ${withheld.id}`;
    const actor = randomUUID();
    await getDatabaseFeed(actor, randomUUID(), 20);
    await getDatabaseFeed(actor, randomUUID(), 3);
    await sql`UPDATE passages SET status = 'published' WHERE id = ${withheld.id}`;
    const page = await getDatabaseFeed(actor, randomUUID(), 1);
    expect(page.items[0].id).toBe(withheld.id);
    expect(page.revisited).toBe(false);
  });

  it("returns a terminal empty response only for an actually empty published library", async () => {
    await sql`UPDATE passages SET status = 'archived'`;
    expect(await getDatabaseFeed(randomUUID(), randomUUID(), 6)).toEqual({
      items: [], nextCursor: null, mode: "database", revisited: false,
      totalMatching: 0, totalPublished: 0,
    });
    expect((await sql`SELECT count(*)::integer AS count FROM actor_feed_pages`)[0].count).toBe(0);
  });

  it("does not replay withdrawn passages as the last real page", async () => {
    const actor = randomUUID();
    const cursor = randomUUID();
    const first = await getDatabaseFeed(actor, cursor, 6);
    const ids = first.items.map((item) => item.id);
    await sql`UPDATE passages SET status = 'archived' WHERE id = ANY(${sql.array(ids)}::uuid[])`;
    const retry = await getDatabaseFeed(actor, cursor, 6);
    expect(retry.items).toHaveLength(6);
    expect(retry.items.every((item) => !ids.includes(item.id))).toBe(true);
  });

  it("publishes catalog counts without creating actors, counting only published quotes", async () => {
    await sql`UPDATE passages SET status = 'archived' WHERE id = (SELECT id FROM passages LIMIT 1)`;
    const library = await getDatabaseLibrary();
    expect(library.total).toBe(23);
    expect(library.books.reduce((total, book) => total + book.count, 0)).toBe(23);
    expect(library.themes.reduce((total, theme) => total + theme.count, 0)).toBe(23);
    expect((await sql`SELECT count(*)::integer AS count FROM actors`)[0].count).toBe(0);
    expect((await sql`SELECT count(*)::integer AS count FROM actor_passage_history`)[0].count).toBe(0);
  });

  it("combines book and theme restrictions before unseen ranking and preserves their endless scroll", async () => {
    const { books } = await getDatabaseLibrary();
    const actor = randomUUID();
    const filters = { bookId: books[0].id, theme: "society" };
    const first = await getDatabaseFeed(actor, randomUUID(), 6, filters);
    expect(first.totalPublished).toBe(24);
    expect(first.totalMatching).toBe(2);
    expect(first.items).toHaveLength(2);
    expect(first.items.every((item) => item.bookTitle === books[0].title && item.themes.includes("society"))).toBe(true);
    expect(first.revisited).toBe(false);
    const again = await getDatabaseFeed(actor, first.nextCursor!, 6, filters);
    expect(again.revisited).toBe(true);
    expect(again.nextCursor).not.toBeNull();
    expect((await getDatabaseFeed(actor, randomUUID(), 6, { theme: "unknown" }))).toMatchObject({
      items: [], nextCursor: null, totalMatching: 0, totalPublished: 24, mode: "database",
    });
  });

  it("does not replay a cursor from a different filter and retains global unseen memory", async () => {
    const { books } = await getDatabaseLibrary();
    const actor = randomUUID();
    const cursor = randomUUID();
    const first = await getDatabaseFeed(actor, cursor, 6, { bookId: books[0].id });
    expect(await getDatabaseFeed(actor, cursor, 6, { bookId: books[0].id })).toEqual(first);
    const second = await getDatabaseFeed(actor, cursor, 6, { bookId: books[1].id });
    expect(second.items.every((item) => item.bookTitle === books[1].title)).toBe(true);
    expect(second.revisited).toBe(false);
    const all = await getDatabaseFeed(actor, randomUUID(), 6);
    const seen = new Set([...first.items, ...second.items].map((item) => item.id));
    expect(all.items.every((item) => !seen.has(item.id))).toBe(true);
  });
});
