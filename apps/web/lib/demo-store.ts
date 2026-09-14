import { createHash, randomUUID } from "node:crypto";

import { demoPassages } from "@/lib/demo-data";
import type {
  FeedFilters,
  FeedPassage,
  FeedResponse,
  LibraryResponse,
  ReactionResponse,
  ReactionValue,
} from "@/lib/types";

type ReactionMap = Map<string, Map<string, Exclude<ReactionValue, 0>>>;
type DemoHistory = {
  served: Map<string, number>;
  pageNumber: number;
  previous?: { cursor: string; filterKey: string; ids: string[]; nextCursor: string; revisited: boolean };
};

declare global {
  var __goodDoomscrollerDemoReactions: ReactionMap | undefined;
  var __goodDoomscrollerDemoHistory: Map<string, DemoHistory> | undefined;
}

const reactions =
  globalThis.__goodDoomscrollerDemoReactions ?? new Map<string, Map<string, -1 | 1>>();
const histories = globalThis.__goodDoomscrollerDemoHistory ?? new Map<string, DemoHistory>();

if (process.env.NODE_ENV !== "production") {
  globalThis.__goodDoomscrollerDemoReactions = reactions;
  globalThis.__goodDoomscrollerDemoHistory = histories;
}

function reactionFor(actorId: string, passageId: string): ReactionValue {
  return reactions.get(actorId)?.get(passageId) ?? 0;
}

function reactionTotals(passageId: string) {
  let likes = 0;
  let dislikes = 0;

  for (const actorReactions of reactions.values()) {
    const value = actorReactions.get(passageId);
    if (value === 1) likes += 1;
    if (value === -1) dislikes += 1;
  }

  return { likes, dislikes };
}

function demoBookId(fixture: (typeof demoPassages)[number]): string {
  return `demo-book-${createHash("sha256").update(JSON.stringify([fixture.author, fixture.bookTitle])).digest("hex").slice(0, 24)}`;
}

export function getDemoLibrary(): LibraryResponse {
  const books = new Map<string, LibraryResponse["books"][number]>();
  const themes = new Map<string, number>();
  for (const fixture of demoPassages) {
    const id = demoBookId(fixture);
    const book = books.get(id) ?? { id, title: fixture.bookTitle, author: fixture.author, count: 0 };
    book.count += 1;
    books.set(id, book);
    for (const theme of new Set(fixture.themes)) {
      if (theme.trim()) themes.set(theme, (themes.get(theme) ?? 0) + 1);
    }
  }
  return {
    books: [...books.values()].sort((a, b) => a.title.localeCompare(b.title) || a.author.localeCompare(b.author)),
    themes: [...themes.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name)),
    total: demoPassages.length,
    mode: "demo",
  };
}

export function getDemoFeed(
  actorId: string,
  cursor: string,
  limit: number,
  filters: FeedFilters = {},
): FeedResponse {
  const matches = demoPassages.filter((fixture) =>
    (!filters.bookId || demoBookId(fixture) === filters.bookId)
    && (!filters.theme || fixture.themes.includes(filters.theme)),
  );
  const totals = { totalMatching: matches.length, totalPublished: demoPassages.length };
  if (matches.length === 0) {
    return { items: [], nextCursor: null, mode: "demo", revisited: false, ...totals };
  }
  const filterKey = JSON.stringify([filters.bookId ?? null, filters.theme ?? null]);
  const history = histories.get(actorId) ?? { served: new Map<string, number>(), pageNumber: 0 };
  // Demo memory is bounded and local to this server. The database implementation
  // persists the same behavior across server restarts and application instances.
  histories.delete(actorId);
  histories.set(actorId, history);
  if (histories.size > 10_000) histories.delete(histories.keys().next().value!);

  if (history.previous?.cursor !== cursor || history.previous.filterKey !== filterKey) {
    const bookRanks = new Map<string, number>();
    const authorRanks = new Map<string, number>();
    const candidates = matches.map((fixture) => ({
      fixture,
      lastServed: history.served.get(fixture.id) ?? -1,
      shuffle: createHash("sha256").update(`${cursor}:${fixture.id}`).digest("hex"),
      bookRank: 0,
      authorRank: 0,
    }));
    candidates.sort((a, b) => a.lastServed - b.lastServed || a.shuffle.localeCompare(b.shuffle));
    for (const candidate of candidates) {
      const key = `${candidate.lastServed}:${candidate.fixture.author}:${candidate.fixture.bookTitle}`;
      candidate.bookRank = (bookRanks.get(key) ?? 0) + 1;
      bookRanks.set(key, candidate.bookRank);
    }
    candidates.sort((a, b) => a.lastServed - b.lastServed || a.bookRank - b.bookRank || a.shuffle.localeCompare(b.shuffle));
    for (const candidate of candidates) {
      const key = `${candidate.lastServed}:${candidate.fixture.author}`;
      candidate.authorRank = (authorRanks.get(key) ?? 0) + 1;
      authorRanks.set(key, candidate.authorRank);
    }
    candidates.sort((a, b) => a.lastServed - b.lastServed || a.authorRank - b.authorRank || a.bookRank - b.bookRank || a.shuffle.localeCompare(b.shuffle));
    const selected = candidates.slice(0, Math.max(1, Math.min(20, Math.floor(limit) || 6)));
    history.previous = {
      cursor,
      filterKey,
      ids: selected.map(({ fixture }) => fixture.id),
      nextCursor: randomUUID(),
      revisited: selected.some(({ lastServed }) => lastServed !== -1),
    };
    history.pageNumber += 1;
    for (const { fixture } of selected) history.served.set(fixture.id, history.pageNumber);
  }
  const page = history.previous;
  const items: FeedPassage[] = page.ids.map((id) => {
    const fixture = demoPassages.find((passage) => passage.id === id)!;
    const totals = reactionTotals(fixture.id);

    return {
      ...fixture,
      feedToken: `${fixture.id}:${cursor}`,
      likes: totals.likes,
      dislikes: totals.dislikes,
      viewerReaction: reactionFor(actorId, fixture.id),
    };
  });

  return {
    items,
    nextCursor: page.nextCursor,
    mode: "demo",
    revisited: page.revisited,
    ...totals,
  };
}

export function setDemoReaction(
  actorId: string,
  passageId: string,
  value: ReactionValue,
): ReactionResponse | null {
  const fixture = demoPassages.find((passage) => passage.id === passageId);
  if (!fixture) return null;

  let actorReactions = reactions.get(actorId);
  if (!actorReactions) {
    actorReactions = new Map();
    reactions.set(actorId, actorReactions);
  }

  if (value === 0) {
    actorReactions.delete(passageId);
  } else {
    actorReactions.set(passageId, value);
  }

  const totals = reactionTotals(passageId);
  return {
    passageId,
    likes: totals.likes,
    dislikes: totals.dislikes,
    viewerReaction: value,
    mode: "demo",
  };
}
