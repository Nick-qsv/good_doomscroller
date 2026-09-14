import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import { demoPassages } from "@/lib/demo-data";
import { getDemoFeed, getDemoLibrary, setDemoReaction } from "@/lib/demo-store";

describe("demo feed", () => {
  it("paginates continuously with unique feed tokens", () => {
    const first = getDemoFeed("actor-a", randomUUID(), 6);
    const second = getDemoFeed("actor-a", first.nextCursor!, 6);

    expect(first.items).toHaveLength(6);
    expect(second.items).toHaveLength(6);
    expect(first.items[0].feedToken).not.toBe(second.items[0].feedToken);
    expect(second.nextCursor).not.toBe(first.nextCursor);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(12);
  });

  it("remembers earlier visits and only revisits after every fixture was served", () => {
    const actor = randomUUID();
    const seen = new Set<string>();
    for (let index = 0; index < demoPassages.length; index += 1) {
      // Each reload starts a fresh cursor but keeps the same browser identity.
      const page = getDemoFeed(actor, randomUUID(), 1);
      expect(page.revisited).toBe(false);
      expect(seen.has(page.items[0].id)).toBe(false);
      seen.add(page.items[0].id);
    }
    const replay = getDemoFeed(actor, randomUUID(), 1);
    expect(replay.revisited).toBe(true);
    expect(replay.nextCursor).not.toBeNull();
    expect(replay.items[0].id).toBe([...seen][0]);
  });

  it("retries a page without skipping more unseen passages", () => {
    const actor = randomUUID();
    const cursor = randomUUID();
    const first = getDemoFeed(actor, cursor, 6);
    expect(getDemoFeed(actor, cursor, 6)).toEqual(first);
    const next = getDemoFeed(actor, first.nextCursor!, 6);
    expect(new Set([...first.items, ...next.items].map((item) => item.id)).size).toBe(12);
    expect(next.revisited).toBe(false);
  });

  it("keeps unseen passages ahead of revisits on a mixed page, then continues indefinitely", () => {
    const actor = randomUUID();
    const first = getDemoFeed(actor, randomUUID(), 12);
    let next = getDemoFeed(actor, first.nextCursor!, 6);
    const previousIds = new Set(first.items.map((item) => item.id));
    expect(next.items.slice(0, 2).every((item) => !previousIds.has(item.id))).toBe(true);
    expect(next.items.slice(2).every((item) => previousIds.has(item.id))).toBe(true);
    expect(next.revisited).toBe(true);
    const tokens = new Set([...first.items, ...next.items].map((item) => item.feedToken));
    for (let pageNumber = 0; pageNumber < 30; pageNumber += 1) {
      next = getDemoFeed(actor, next.nextCursor!, 6);
      expect(next.items).toHaveLength(6);
      expect(next.nextCursor).not.toBeNull();
      for (const item of next.items) {
        expect(tokens.has(item.feedToken)).toBe(false);
        tokens.add(item.feedToken);
      }
    }
  });

  it("separates browser history and offers all authors before a second passage by one author", () => {
    const cursor = randomUUID();
    const first = getDemoFeed(randomUUID(), cursor, 6);
    const independent = getDemoFeed(randomUUID(), cursor, 6);
    expect(independent.items.map((item) => item.id)).toEqual(first.items.map((item) => item.id));
    expect(independent.revisited).toBe(false);
    expect(new Set(first.items.map((item) => item.author)).size).toBe(6);
  });

  it("returns one occurrence per passage for an oversized page", () => {
    const page = getDemoFeed(randomUUID(), randomUUID(), 200);
    expect(page.items).toHaveLength(demoPassages.length);
    expect(new Set(page.items.map((item) => item.id)).size).toBe(demoPassages.length);
    expect(page.nextCursor).not.toBeNull();
  });

  it("builds a deterministic public catalog whose counts match filtered feeds", () => {
    const catalog = getDemoLibrary();
    expect(getDemoLibrary()).toEqual(catalog);
    expect(catalog.total).toBe(demoPassages.length);
    expect(catalog.books.reduce((total, book) => total + book.count, 0)).toBe(catalog.total);
    for (const book of catalog.books) {
      const page = getDemoFeed(randomUUID(), randomUUID(), 20, { bookId: book.id });
      expect(page.totalMatching).toBe(book.count);
      expect(page.totalPublished).toBe(catalog.total);
      expect(page.items.every((item) => item.bookTitle === book.title && item.author === book.author)).toBe(true);
    }
    for (const theme of catalog.themes) {
      const page = getDemoFeed(randomUUID(), randomUUID(), 20, { theme: theme.name });
      expect(page.totalMatching).toBe(theme.count);
      expect(page.items.every((item) => item.themes.includes(theme.name))).toBe(true);
    }
  });

  it("combines book and theme filters and returns no items for an incompatible pair", () => {
    const fixture = demoPassages[0];
    const book = getDemoLibrary().books.find((item) => item.title === fixture.bookTitle)!;
    const theme = fixture.themes[0];
    const matching = getDemoFeed(randomUUID(), randomUUID(), 6, { bookId: book.id, theme });
    expect(matching.items.length).toBeGreaterThan(0);
    expect(matching.items.every((item) => item.bookTitle === book.title && item.themes.includes(theme))).toBe(true);
    expect(matching.nextCursor).not.toBeNull();
    expect(getDemoFeed(randomUUID(), randomUUID(), 6, { bookId: book.id, theme: "__unavailable_theme__" })).toEqual({
      items: [], nextCursor: null, mode: "demo", revisited: false, totalMatching: 0, totalPublished: demoPassages.length,
    });
  });

  it("scopes replay to the filters while preserving global unseen history", () => {
    const actor = randomUUID();
    const cursor = randomUUID();
    const [firstBook, secondBook] = getDemoLibrary().books;
    const first = getDemoFeed(actor, cursor, 6, { bookId: firstBook.id });
    expect(getDemoFeed(actor, cursor, 6, { bookId: firstBook.id })).toEqual(first);
    const second = getDemoFeed(actor, cursor, 6, { bookId: secondBook.id });
    expect(second.items.every((item) => item.bookTitle === secondBook.title)).toBe(true);
    expect(second.revisited).toBe(false);
    const again = getDemoFeed(actor, randomUUID(), 6, { bookId: firstBook.id });
    expect(again.revisited).toBe(true);
    const all = getDemoFeed(actor, randomUUID(), 6);
    const alreadyServed = new Set([...first.items, ...second.items].map((item) => item.id));
    expect(all.items.every((item) => !alreadyServed.has(item.id))).toBe(true);
  });

  it("supports like, dislike, and undo", () => {
    const passage = getDemoFeed("actor-b", randomUUID(), 1).items[0];
    expect(passage.likes).toBe(0);
    expect(passage.dislikes).toBe(0);

    const liked = setDemoReaction("actor-b", passage.id, 1);
    const disliked = setDemoReaction("actor-b", passage.id, -1);
    const undone = setDemoReaction("actor-b", passage.id, 0);

    expect(liked?.viewerReaction).toBe(1);
    expect(liked?.likes).toBe(1);
    expect(liked?.dislikes).toBe(0);
    expect(disliked?.viewerReaction).toBe(-1);
    expect(disliked?.likes).toBe(0);
    expect(disliked?.dislikes).toBe(1);
    expect(undone?.viewerReaction).toBe(0);
    expect(undone?.likes).toBe(0);
    expect(undone?.dislikes).toBe(0);
  });
});
