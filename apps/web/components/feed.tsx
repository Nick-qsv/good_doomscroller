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
import { useCallback, useEffect, useRef, useState } from "react";

import { useAnalyticsExposure } from "@/components/analytics";
import { trackAnalytics } from "@/lib/analytics-client";
import { AiPassageContext } from "@/components/ai-passage-context";
import { sourceSectionLabel } from "@/lib/source-section";
import type {
  FeedPassage,
  FeedResponse,
  ReactionResponse,
  ReactionValue,
} from "@/lib/types";

const PAGE_SIZE = 6;
const numberFormatter = new Intl.NumberFormat("en", { notation: "compact" });

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

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
  return (
    <article ref={analyticsRef} className="passage-card" aria-labelledby={`passage-${passage.feedToken}`}>
      <div className="avatar" aria-hidden="true">
        {initials(passage.author)}
      </div>

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
          <p>{passage.text}</p>
        </blockquote>

        <AiPassageContext context={passage.aiContext} passageId={passage.id} />

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
  const [items, setItems] = useState<FeedPassage[]>([]);
  const [cursor, setCursor] = useState<string | null>("0");
  const [mode, setMode] = useState<"database" | "demo" | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [showTop, setShowTop] = useState(false);
  const loadingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/feed?cursor=${encodeURIComponent(cursor)}&limit=${PAGE_SIZE}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("feed request failed");

      const feed = (await response.json()) as FeedResponse;
      setItems((current) => [...current, ...feed.items]);
      setCursor(feed.nextCursor);
      setMode(feed.mode);
      trackAnalytics("feed_load", { value: feed.items.length });
      if (feed.nextCursor === null) trackAnalytics("feed_end");
    } catch {
      trackAnalytics("feed_error");
      setError("The library door stuck. Give it another push.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [cursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || cursor === null || error) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [cursor, error, loadMore]);

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
          <h1 id="feed-heading">The good feed.</h1>
          <div className="edition-stamp" aria-label="Version one">
            <strong>V.1</strong>
          </div>
        </section>

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

          {!loading && !error && cursor === null ? (
            <div className="end-note">
              <BookOpen size={21} aria-hidden="true" />
              <p>End of shelf.</p>
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
        </p>
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
