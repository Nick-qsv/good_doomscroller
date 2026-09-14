"use client";

import {
  ArrowUp,
  BookOpen,
  FileSearch,
  ExternalLink,
  Feather,
  RotateCcw,
  Sparkles,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useAnalyticsExposure } from "@/components/analytics";
import { trackAnalytics } from "@/lib/analytics-client";
import { AiPassageContext } from "@/components/ai-passage-context";
import { AuthorAvatar } from "@/components/author-avatar";
import { ReadingSettings } from "@/components/reading-settings";
import { SourceLicenseNotice } from "@/components/source-license-notice";
import { sourceSectionLabel } from "@/lib/source-section";
import type {
  FeedPassage,
  FeedResponse,
  LibraryResponse,
  ReactionResponse,
  ReactionValue,
} from "@/lib/types";

const PAGE_SIZE = 6;
const numberFormatter = new Intl.NumberFormat("en", { notation: "compact" });

type FeedSelection = { book: string; theme: string };

function count(value: number) {
  return numberFormatter.format(value);
}

export function PassageCard({
  passage,
  pending,
  onReact,
  position = 1,
}: {
  passage: FeedPassage;
  pending: boolean;
  position?: number;
  onReact: (passage: FeedPassage, value: -1 | 1) => void;
}) {
  const analyticsRef = useAnalyticsExposure<HTMLElement>("passage_view", passage.id, position);
  const [contextExpanded, setContextExpanded] = useState(false);
  const contextId = useId();
  const contextHintId = `${contextId}-hint`;
  return (
    <article ref={analyticsRef} className="passage-card" aria-labelledby={`passage-${passage.feedToken}`}>
      <AuthorAvatar author={passage.author} />

      <div className="passage-body">
        <header className="passage-byline">
          <div className="byline-copy">
            <h2 id={`passage-${passage.feedToken}`}>{passage.author}</h2>
            <p>
              <cite>{passage.bookTitle}</cite>
              {passage.publicationYear ? ` · ${passage.publicationYear}` : ""}
            </p>
          </div>
          <a
            className="source-link"
            href={passage.sourceUrl}
            onClick={() => trackAnalytics("source_open", { passageId: passage.id })}
            target="_blank"
            rel="noreferrer"
            aria-label={`Read the source of ${passage.bookTitle} (opens in a new tab)`}
          >
            source
            <ExternalLink aria-hidden="true" size={13} strokeWidth={1.8} />
          </a>
        </header>

        <blockquote>
          <span className="opening-quote" aria-hidden="true">
            “
          </span>
          <p>
            {passage.aiContext ? (
              <button
                type="button"
                className="quote-context-toggle"
                aria-expanded={contextExpanded}
                aria-controls={contextId}
                aria-describedby={contextHintId}
                onClick={() => setContextExpanded((expanded) => !expanded)}
              >
                {passage.text}
              </button>
            ) : passage.text}
          </p>
        </blockquote>

        {passage.aiContext ? (
          <>
            <p className="quote-context-hint" id={contextHintId}>
              <Sparkles size={12} aria-hidden="true" />
              {contextExpanded ? "Select quote to hide AI context" : "Select quote for AI context"}
            </p>
            <div id={contextId} hidden={!contextExpanded}>
              {contextExpanded ? <AiPassageContext context={passage.aiContext} passageId={passage.id} /> : null}
            </div>
          </>
        ) : null}

        <div className="passage-context">
          {passage.chapterTitle ? (
            <span className="chapter-label">{sourceSectionLabel(passage.chapterTitle)}</span>
          ) : null}
          <ul className="theme-list" aria-label="Themes">
            {passage.themes.slice(0, 3).map((theme) => (
              <li key={theme}>#{theme}</li>
            ))}
          </ul>
        </div>

        <footer className="passage-actions">
          <button
            className={`reaction-button reaction-like${passage.viewerReaction === 1 ? " selected" : ""}`}
            type="button"
            aria-label={`${passage.viewerReaction === 1 ? "Remove like from" : "Like"} passage by ${passage.author}`}
            aria-pressed={passage.viewerReaction === 1}
            disabled={pending}
            onClick={() => onReact(passage, 1)}
          >
            <span className="action-icon">
              <ThumbsUp aria-hidden="true" size={17} strokeWidth={1.9} />
            </span>
            <span>{count(passage.likes)}</span>
          </button>
          <button
            className={`reaction-button reaction-dislike${passage.viewerReaction === -1 ? " selected" : ""}`}
            type="button"
            aria-label={`${passage.viewerReaction === -1 ? "Remove dislike from" : "Dislike"} passage by ${passage.author}`}
            aria-pressed={passage.viewerReaction === -1}
            disabled={pending}
            onClick={() => onReact(passage, -1)}
          >
            <span className="action-icon">
              <ThumbsDown aria-hidden="true" size={17} strokeWidth={1.9} />
            </span>
            <span>{count(passage.dislikes)}</span>
          </button>
          <Link
            className="verify-quote-link"
            href={`/passages/${encodeURIComponent(passage.id)}/verification`}
            prefetch={false}
            onClick={() => trackAnalytics("verification_open", { passageId: passage.id })}
            aria-label={`Verify quote from ${passage.bookTitle}`}
          >
            <FileSearch aria-hidden="true" size={15} strokeWidth={1.7} />
            Verify quote
          </Link>
          <span className="public-domain-mark">
            <BookOpen aria-hidden="true" size={15} strokeWidth={1.7} />
            Public domain
          </span>
        </footer>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-avatar shimmer" />
      <div className="skeleton-content">
        <div className="skeleton-line skeleton-short shimmer" />
        <div className="skeleton-line skeleton-medium shimmer" />
        <div className="skeleton-quote shimmer" />
        <div className="skeleton-line shimmer" />
      </div>
    </div>
  );
}

function applyOptimisticReaction(
  item: FeedPassage,
  requested: -1 | 1,
): FeedPassage {
  const previous = item.viewerReaction;
  const next: ReactionValue = previous === requested ? 0 : requested;

  return {
    ...item,
    likes: item.likes - (previous === 1 ? 1 : 0) + (next === 1 ? 1 : 0),
    dislikes:
      item.dislikes - (previous === -1 ? 1 : 0) + (next === -1 ? 1 : 0),
    viewerReaction: next,
  };
}

export function Feed() {
  const searchParams = useSearchParams();
  const selection = {
    book: searchParams.get("book") ?? "",
    theme: searchParams.get("theme") ?? "",
  };
  const [library, setLibrary] = useState<LibraryResponse | null>(null);
  const [libraryError, setLibraryError] = useState(false);
  const [libraryAttempt, setLibraryAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    void (async () => {
      try {
        const response = await fetch("/api/library", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("library request failed");
        const catalog = (await response.json()) as LibraryResponse;
        if (active) setLibrary(catalog);
      } catch {
        if (active) setLibraryError(true);
      } finally {
        window.clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [libraryAttempt]);

  const selectFilters = (next: FeedSelection) => {
    const url = new URL(window.location.href);
    for (const name of ["book", "theme"] as const) {
      if (next[name]) url.searchParams.set(name, next[name]);
      else url.searchParams.delete(name);
    }
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <SelectedFeed
      // Remounting starts a fresh page UUID and isolates every selection's
      // pagination, including browser back/forward and late network responses.
      key={JSON.stringify(selection)}
      selection={selection}
      library={library}
      libraryError={libraryError}
      onSelect={selectFilters}
      onRetryLibrary={() => {
        setLibraryError(false);
        setLibraryAttempt((current) => current + 1);
      }}
    />
  );
}

function SelectedFeed({ selection, library, libraryError, onSelect, onRetryLibrary }: {
  selection: FeedSelection;
  library: LibraryResponse | null;
  libraryError: boolean;
  onSelect: (selection: FeedSelection) => void;
  onRetryLibrary: () => void;
}) {
  const [items, setItems] = useState<FeedPassage[]>([]);
  const [cursor, setCursor] = useState<string | null>("");
  const [mode, setMode] = useState<"database" | "demo" | null>(null);
  const [revisited, setRevisited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [showTop, setShowTop] = useState(false);
  const [totalMatching, setTotalMatching] = useState<number | null>(null);
  const loadingRef = useRef(false);
  const activeRef = useRef(true);
  const requestControllerRef = useRef<AbortController | null>(null);
  const firstRequestRef = useRef<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const filtered = Boolean(selection.book || selection.theme);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      requestControllerRef.current?.abort();
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (!activeRef.current || loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const controller = new AbortController();
    requestControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      // Keep the first request's ID through retries. A fresh visit gets a new ID;
      // the server uses the reader cookie to continue with unseen passages.
      const requestCursor = cursor || (firstRequestRef.current ??= crypto.randomUUID());
      const params = new URLSearchParams({ cursor: requestCursor, limit: String(PAGE_SIZE) });
      if (selection.book) params.set("book", selection.book);
      if (selection.theme) params.set("theme", selection.theme);
      const response = await fetch(
        `/api/feed?${params}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!response.ok) throw new Error("feed request failed");

      const feed = (await response.json()) as FeedResponse;
      if (!activeRef.current) return;
      if (feed.nextCursor === requestCursor || (feed.items.length === 0 && feed.nextCursor !== null)) {
        throw new Error("feed did not advance");
      }
      setItems((current) => {
        const loaded = new Set(current.map((item) => item.feedToken));
        return [...current, ...feed.items.filter((item) => !loaded.has(item.feedToken))];
      });
      setCursor(feed.nextCursor);
      setMode(feed.mode);
      setTotalMatching(feed.totalMatching ?? null);
      setRevisited((current) => current || Boolean(feed.revisited));
      trackAnalytics("feed_load", { value: feed.items.length });
      if (feed.nextCursor === null) trackAnalytics("feed_end");
    } catch {
      if (!activeRef.current) return;
      trackAnalytics("feed_error");
      setError("The library door stuck. Give it another push.");
    } finally {
      window.clearTimeout(timeout);
      if (activeRef.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [cursor, selection.book, selection.theme]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || cursor === null || error) return;
    // The initial page must load even when IntersectionObserver is unavailable.
    if (items.length === 0) {
      const initialLoad = window.setTimeout(() => void loadMore(), 0);
      return () => window.clearTimeout(initialLoad);
    }
    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, error, items.length, loadMore]);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 900);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const reactToPassage = useCallback(
    async (passage: FeedPassage, requested: -1 | 1) => {
      if (pendingIds.has(passage.id)) return;

      const optimistic = applyOptimisticReaction(passage, requested);
      const previous = passage.viewerReaction;
      setPendingIds((current) => new Set(current).add(passage.id));
      setNotice(null);
      setItems((current) =>
        current.map((item) =>
          item.id === passage.id
            ? {
                ...item,
                likes:
                  item.likes - (previous === 1 ? 1 : 0) +
                  (optimistic.viewerReaction === 1 ? 1 : 0),
                dislikes:
                  item.dislikes - (previous === -1 ? 1 : 0) +
                  (optimistic.viewerReaction === -1 ? 1 : 0),
                viewerReaction: optimistic.viewerReaction,
              }
            : item,
        ),
      );

      try {
        const response = await fetch(`/api/reactions/${encodeURIComponent(passage.id)}`, {
          method: optimistic.viewerReaction === 0 ? "DELETE" : "PUT",
          headers:
            optimistic.viewerReaction === 0
              ? undefined
              : { "Content-Type": "application/json" },
          body:
            optimistic.viewerReaction === 0
              ? undefined
              : JSON.stringify({ value: optimistic.viewerReaction }),
        });
        if (!response.ok) throw new Error("reaction request failed");

        const saved = (await response.json()) as ReactionResponse;
        trackAnalytics("reaction", { passageId: passage.id, value: saved.viewerReaction });
        setItems((current) =>
          current.map((item) =>
            item.id === saved.passageId
              ? {
                  ...item,
                  likes: saved.likes,
                  dislikes: saved.dislikes,
                  viewerReaction: saved.viewerReaction,
                }
              : item,
          ),
        );
      } catch {
        trackAnalytics("reaction_error", { passageId: passage.id });
        setItems((current) =>
          current.map((item) =>
            item.id === passage.id
              ? {
                  ...item,
                  likes:
                    item.likes - (optimistic.viewerReaction === 1 ? 1 : 0) +
                    (previous === 1 ? 1 : 0),
                  dislikes:
                    item.dislikes - (optimistic.viewerReaction === -1 ? 1 : 0) +
                    (previous === -1 ? 1 : 0),
                  viewerReaction: previous,
                }
              : item,
          ),
        );
        setNotice("That reaction didn’t stick. Please try once more.");
      } finally {
        setPendingIds((current) => {
          const next = new Set(current);
          next.delete(passage.id);
          return next;
        });
      }
    },
    [pendingIds],
  );

  return (
    <div className="site-shell">
      <a className="skip-link" href="#passage-feed">
        Skip to passages
      </a>

      <aside className="left-rail" aria-label="Good Doomscroller">
        <a className="brand" href="#top" aria-label="Good Doomscroller home">
          <span className="brand-mark" aria-hidden="true">
            <Feather size={22} strokeWidth={1.7} />
          </span>
          <span>
            <strong>good</strong>
            <small>doomscroller</small>
          </span>
        </a>

        <nav className="rail-nav" aria-label="Primary">
          <a href="#passage-feed" aria-current="page">
            <Sparkles size={19} aria-hidden="true" />
            For you
          </a>
          <Link href="/privacy">
            <ShieldCheck size={19} aria-hidden="true" />
            Privacy
          </Link>
          <Link href="/how-it-works">
            <FileSearch size={19} aria-hidden="true" />
            How it works
          </Link>
        </nav>
      </aside>

      <main className="feed-column" id="top">
        <header className="mobile-header">
          <a className="mobile-brand" href="#top" aria-label="Good Doomscroller home">
            <Feather size={19} aria-hidden="true" />
            <span>good doomscroller</span>
          </a>
          <span className="header-badge">public domain<br /><Link href="/privacy" aria-label="Privacy and analytics">Privacy</Link></span>
        </header>

        <section className="feed-intro" aria-labelledby="feed-heading">
          <div>
            <h1 id="feed-heading">The good feed.</h1>
            <Link className="feed-method-link" href="/how-it-works">How we choose and check the quotes →</Link>
          </div>
          <div className="edition-stamp" aria-label="Version one">
            <strong>V.1</strong>
          </div>
        </section>

        <SourceLicenseNotice />

        <section className="feed-filters" aria-label="Filter quotes">
          <div className="feed-filter-fields">
            <div className="feed-filter-field">
              <label htmlFor="filter-book">Book</label>
              <select
                id="filter-book"
                value={selection.book}
                disabled={!library}
                onChange={(event) => onSelect({ ...selection, book: event.target.value })}
              >
                <option value="">All books</option>
                {selection.book && !library?.books.some((book) => book.id === selection.book) ? (
                  <option value={selection.book}>Selected book unavailable</option>
                ) : null}
                {library?.books.map((book) => (
                  <option key={book.id} value={book.id}>{book.title} · {book.author}</option>
                ))}
              </select>
            </div>
            <div className="feed-filter-field">
              <label htmlFor="filter-theme">Theme</label>
              <select
                id="filter-theme"
                value={selection.theme}
                disabled={!library}
                onChange={(event) => onSelect({ ...selection, theme: event.target.value })}
              >
                <option value="">All themes</option>
                {selection.theme && !library?.themes.some((theme) => theme.name === selection.theme) ? (
                  <option value={selection.theme}>{selection.theme}</option>
                ) : null}
                {library?.themes.map((theme) => (
                  <option key={theme.name} value={theme.name}>{theme.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="feed-filter-summary">
            <p aria-live="polite">
              {totalMatching !== null
                ? `${totalMatching.toLocaleString()} ${totalMatching === 1 ? "quote" : "quotes"}${filtered ? (totalMatching === 1 ? " matches your filters" : " match your filters") : " to explore"}`
                : "Find your next good read."}
            </p>
            {filtered ? (
              <button type="button" onClick={() => onSelect({ book: "", theme: "" })}>Reset filters</button>
            ) : null}
          </div>
          {libraryError ? (
            <p className="feed-filter-error" role="status">
              Book and theme choices couldn’t load.{" "}
              <button type="button" onClick={onRetryLibrary}>Retry filters</button>
            </p>
          ) : null}
        </section>

        <ReadingSettings />

        {mode === "demo" ? (
          <div className="demo-banner" role="status">
            <Sparkles size={15} aria-hidden="true" />
            <strong>Sample shelf</strong>
          </div>
        ) : null}

        <section id="passage-feed" aria-label="Passage feed" aria-busy={loading}>
          {items.map((passage, index) => (
            <PassageCard
              key={passage.feedToken}
              passage={passage}
              position={index + 1}
              pending={pendingIds.has(passage.id)}
              onReact={reactToPassage}
            />
          ))}

          {loading ? (
            <>
              <FeedSkeleton />
              {items.length === 0 ? <FeedSkeleton /> : null}
              <span className="sr-only" role="status">
                Loading…
              </span>
            </>
          ) : null}

          {error ? (
            <div className="feed-error" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => void loadMore()}>
                <RotateCcw size={16} aria-hidden="true" />
                Try again
              </button>
            </div>
          ) : null}

          {!loading && !error && cursor === null && items.length === 0 ? (
            <div className="end-note">
              <BookOpen size={21} aria-hidden="true" />
              <p>{filtered ? "No quotes match these filters. Try another book or theme, or reset your filters." : "No passages are available yet. Please check back soon."}</p>
            </div>
          ) : null}

          {revisited ? (
            <p className="feed-revisit-note" role="status">
              {filtered ? "You’ve explored the quotes matching these filters. Keep scrolling to revisit them, or try a different selection." : "You’ve explored the current library. Keep scrolling to revisit earlier quotes."}
            </p>
          ) : null}

          {!loading && !error && cursor !== null ? (
            <div className="feed-more">
              <button type="button" onClick={() => void loadMore()}>Load more quotes</button>
            </div>
          ) : null}

          <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
        </section>
      </main>

      <aside className="right-rail" aria-label="Source">
        <div className="about-card">
          <div className="about-icon" aria-hidden="true">
            <BookOpen size={19} strokeWidth={1.8} />
          </div>
          <h2>Public-domain books.</h2>
        </div>
        <p className="source-note">
          <a href="https://www.gutenberg.org/">Project Gutenberg</a>
          {" · "}<Link href="/privacy">Privacy &amp; analytics</Link>
          {" · "}<Link href="/terms">Terms</Link>
        </p>
        <p className="source-note">Good Doomscroller is operated by 25D94 LLC.<br /><a href="mailto:contact@vrgammon.com">contact@vrgammon.com</a></p>
      </aside>

      <p className="save-notice" aria-live="polite">
        {notice}
      </p>

      <button
        className={`back-to-top${showTop ? " visible" : ""}`}
        type="button"
        aria-label="Back to top"
        tabIndex={showTop ? 0 : -1}
        onClick={() => {
          trackAnalytics("back_to_top");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <ArrowUp size={19} aria-hidden="true" />
      </button>
    </div>
  );
}
