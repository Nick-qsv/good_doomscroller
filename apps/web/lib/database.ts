import { randomUUID } from "node:crypto";
import postgres from "postgres";

import type {
  AiContext,
  FeedFilters,
  FeedPassage,
  FeedResponse,
  ReactionResponse,
  ReactionValue,
} from "@/lib/types";

type DatabaseSecret = {
  host?: string;
  port?: number | string;
  dbname?: string;
  database?: string;
  username?: string;
  user?: string;
  password?: string;
};

type DatabaseClient = ReturnType<typeof postgres>;

declare global {
  var __goodDoomscrollerDatabase: DatabaseClient | undefined;
}

function firstValue(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value !== undefined && value !== "");
}

function databaseSecret(): DatabaseSecret {
  const raw = firstValue(process.env.DATABASE_SECRET_JSON, process.env.DB_SECRET_JSON);
  if (!raw) return {};

  try {
    return JSON.parse(raw) as DatabaseSecret;
  } catch {
    throw new Error("DATABASE_SECRET_JSON/DB_SECRET_JSON must be valid JSON");
  }
}

export function isDatabaseConfigured(): boolean {
  if (process.env.DATABASE_URL) return true;

  const secret = databaseSecret();
  return Boolean(
    firstValue(
      process.env.DATABASE_HOST,
      process.env.DB_HOST,
      secret.host,
    ),
  );
}

export function getDatabase(): DatabaseClient {
  if (globalThis.__goodDoomscrollerDatabase) {
    return globalThis.__goodDoomscrollerDatabase;
  }

  const max = Number.parseInt(process.env.DATABASE_POOL_SIZE ?? "5", 10);
  const idleTimeout = Number.parseInt(process.env.DATABASE_IDLE_TIMEOUT ?? "20", 10);
  const connectTimeout = Number.parseInt(
    process.env.DATABASE_CONNECT_TIMEOUT ?? "10",
    10,
  );

  let client: DatabaseClient;
  if (process.env.DATABASE_URL) {
    client = postgres(process.env.DATABASE_URL, {
      max,
      idle_timeout: idleTimeout,
      connect_timeout: connectTimeout,
      ...(process.env.DATABASE_SSL === "require" ? { ssl: "require" } : {}),
    });
  } else {
    const secret = databaseSecret();
    const host = firstValue(
      process.env.DATABASE_HOST,
      process.env.DB_HOST,
      secret.host,
    );
    if (!host) throw new Error("Database host is not configured");

    const port = Number.parseInt(
      firstValue(
        process.env.DATABASE_PORT,
        process.env.DB_PORT,
        secret.port?.toString(),
      ) ?? "5432",
      10,
    );
    const database = firstValue(
      process.env.DATABASE_NAME,
      process.env.DB_NAME,
      secret.dbname,
      secret.database,
    );
    const username = firstValue(
      process.env.DATABASE_USER,
      process.env.DB_USER,
      secret.username,
      secret.user,
    );
    const password = firstValue(
      process.env.DATABASE_PASSWORD,
      process.env.DB_PASSWORD,
      secret.password,
    );

    if (!database || !username || !password) {
      throw new Error("Database name, username, and password are required");
    }

    const disableSsl = firstValue(process.env.DATABASE_SSL, process.env.DB_SSL) === "disable";
    client = postgres({
      host,
      port,
      database,
      username,
      password,
      max,
      idle_timeout: idleTimeout,
      connect_timeout: connectTimeout,
      ssl: disableSsl ? false : "require",
    });
  }

  // The production web server is a long-lived Node process. Keep one bounded pool per process
  // instead of opening a new pool for every feed, reaction, and health request.
  globalThis.__goodDoomscrollerDatabase = client;
  return client;
}

function jsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  if (typeof value === "string") {
    try {
      return jsonArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

export async function getDatabaseFeed(
  actorId: string,
  cursor: string,
  limit: number,
  filters: FeedFilters = {},
): Promise<FeedResponse> {
  const sql = getDatabase();
  const bookId = filters.bookId ?? null;
  const theme = filters.theme ?? null;
  const filterKey = JSON.stringify([bookId, theme]);
  type PassageRow = {
    id: string;
    exact_text: string;
    ai_context: AiContext | null;
    author: string;
    title: string;
    chapter_title: string | null;
    source_url: string;
    original_publication_year: number | null;
    themes: unknown;
    likes: number | string;
    dislikes: number | string;
    viewer_reaction: number | string | null;
  };

  return sql.begin(async (transaction) => {
    // A browser can have overlapping requests or multiple tabs. Serialize its
    // selection and history update so both requests cannot reserve the same set.
    await transaction`SELECT pg_advisory_xact_lock(hashtextextended(${actorId}, 7417))`;
    await transaction`
      INSERT INTO actors (id) VALUES (${actorId}::uuid)
      ON CONFLICT (id) DO UPDATE SET last_seen_at = clock_timestamp()
    `;

    const [counts] = await transaction<Array<{ total_published: number; total_matching: number }>>`
      SELECT count(*)::integer AS total_published,
        count(*) FILTER (WHERE
          (${bookId}::text IS NULL OR fp.book_id::text = ${bookId})
          AND (${theme}::text IS NULL OR fp.themes ? ${theme}::text)
        )::integer AS total_matching
      FROM feed_passages fp
    `;
    const totalMatching = Number(counts.total_matching);
    const totalPublished = Number(counts.total_published);

    const loadPassages = (ids: string[]) => transaction<PassageRow[]>`
      SELECT fp.id, fp.exact_text, p.ai_context, fp.author, fp.title,
        fp.chapter_title, fp.source_url, fp.original_publication_year, fp.themes,
        totals.likes, totals.dislikes, totals.viewer_reaction
      FROM unnest(${transaction.array(ids)}::uuid[]) WITH ORDINALITY AS chosen(id, position)
      JOIN feed_passages fp ON fp.id = chosen.id
      JOIN passages p ON p.id = fp.id
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE r.value = 1) AS likes,
          count(*) FILTER (WHERE r.value = -1) AS dislikes,
          max(r.value) FILTER (WHERE r.actor_id = ${actorId}::uuid) AS viewer_reaction
        FROM reactions r WHERE r.passage_id = fp.id
      ) totals ON true
      WHERE (${bookId}::text IS NULL OR fp.book_id::text = ${bookId})
        AND (${theme}::text IS NULL OR fp.themes ? ${theme}::text)
      ORDER BY chosen.position
    `;

    const [previous] = await transaction<Array<{
      passage_ids: string[]; next_cursor: string; revisited: boolean;
    }>>`
      SELECT passage_ids, next_cursor, revisited FROM actor_feed_pages
      WHERE actor_id = ${actorId}::uuid AND request_id = ${cursor}::uuid
        AND filter_key = ${filterKey}
    `;

    let rows: PassageRow[];
    let nextCursor: string;
    let revisited: boolean;
    const replay = previous ? await loadPassages(previous.passage_ids) : null;
    if (previous && replay?.length === previous.passage_ids.length) {
      // A lost response can be retried without consuming another unseen page.
      rows = replay;
      nextCursor = previous.next_cursor;
      revisited = previous.revisited;
    } else {
      const selected = await transaction<Array<{ id: string; revisited: boolean }>>`
        WITH candidates AS (
          SELECT fp.id, fp.book_id, fp.author, history.last_served_at,
            md5(fp.id::text || ${cursor}) AS shuffle_key
          FROM feed_passages fp
          LEFT JOIN actor_passage_history history
            ON history.actor_id = ${actorId}::uuid AND history.passage_id = fp.id
          WHERE (${bookId}::text IS NULL OR fp.book_id::text = ${bookId})
            AND (${theme}::text IS NULL OR fp.themes ? ${theme}::text)
        ), books AS (
          SELECT *, row_number() OVER (
            PARTITION BY book_id, last_served_at ORDER BY shuffle_key, id
          ) AS book_rank FROM candidates
        ), authors AS (
          SELECT *, row_number() OVER (
            PARTITION BY author, last_served_at ORDER BY book_rank, shuffle_key, id
          ) AS author_rank FROM books
        )
        SELECT id, last_served_at IS NOT NULL AS revisited FROM authors
        -- Freshness always wins over variety: new passages first, then the ones
        -- served longest ago. Spread authors/books within each freshness group.
        ORDER BY last_served_at ASC NULLS FIRST, author_rank, book_rank, shuffle_key, id
        LIMIT ${Math.max(1, Math.min(20, Math.floor(limit) || 6))}
      `;
      if (selected.length === 0) {
        return {
          items: [], nextCursor: null, mode: "database" as const, revisited: false,
          totalMatching, totalPublished,
        };
      }
      const ids = selected.map((row) => row.id);
      rows = await loadPassages(ids);
      nextCursor = randomUUID();
      revisited = selected.some((row) => row.revisited);

      await transaction`
        INSERT INTO actor_passage_history (actor_id, passage_id, last_served_at)
        SELECT ${actorId}::uuid, id, stamp.served_at
        FROM unnest(${transaction.array(ids)}::uuid[]) AS selected(id)
        CROSS JOIN (SELECT clock_timestamp() AS served_at) stamp
        ON CONFLICT (actor_id, passage_id)
        DO UPDATE SET last_served_at = EXCLUDED.last_served_at
      `;
      await transaction`
        INSERT INTO actor_feed_pages (actor_id, request_id, passage_ids, next_cursor, revisited, filter_key)
        VALUES (${actorId}::uuid, ${cursor}::uuid, ${transaction.array(ids)}::uuid[], ${nextCursor}::uuid, ${revisited}, ${filterKey})
        ON CONFLICT (actor_id) DO UPDATE SET request_id = EXCLUDED.request_id,
          passage_ids = EXCLUDED.passage_ids, next_cursor = EXCLUDED.next_cursor,
          revisited = EXCLUDED.revisited, filter_key = EXCLUDED.filter_key
      `;
    }

    const items: FeedPassage[] = rows.map((row) => ({
      id: row.id,
      feedToken: `${row.id}:${cursor}`,
      text: row.exact_text,
      ...(row.ai_context ? { aiContext: row.ai_context } : {}),
      author: row.author,
      bookTitle: row.title,
      publicationYear: row.original_publication_year,
      chapterTitle: row.chapter_title,
      sourceUrl: row.source_url,
      themes: jsonArray(row.themes),
      likes: Number(row.likes ?? 0),
      dislikes: Number(row.dislikes ?? 0),
      viewerReaction: Number(row.viewer_reaction ?? 0) as ReactionValue,
    }));

    return {
      items,
      nextCursor,
      mode: "database",
      revisited,
      totalMatching,
      totalPublished,
    };
  });
}

export async function setDatabaseReaction(
  actorId: string,
  passageId: string,
  value: ReactionValue,
): Promise<ReactionResponse | null> {
  const sql = getDatabase();
  const exists = await sql<Array<{ id: string }>>`
    SELECT id FROM feed_passages WHERE id = ${passageId}::uuid LIMIT 1
  `;
  if (exists.length === 0) return null;

  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO actors (id)
      VALUES (${actorId}::uuid)
      ON CONFLICT (id) DO NOTHING
    `;

    if (value === 0) {
      await transaction`
        DELETE FROM reactions
        WHERE actor_id = ${actorId}::uuid AND passage_id = ${passageId}::uuid
      `;
    } else {
      await transaction`
        INSERT INTO reactions (actor_id, passage_id, value)
        VALUES (${actorId}::uuid, ${passageId}::uuid, ${value})
        ON CONFLICT (actor_id, passage_id)
        DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      `;
    }
  });

  const [summary] = await sql<
    Array<{
      likes: number | string;
      dislikes: number | string;
      viewer_reaction: number | string | null;
    }>
  >`
    SELECT
      count(*) FILTER (WHERE value = 1) AS likes,
      count(*) FILTER (WHERE value = -1) AS dislikes,
      max(value) FILTER (WHERE actor_id = ${actorId}::uuid) AS viewer_reaction
    FROM reactions
    WHERE passage_id = ${passageId}::uuid
  `;

  return {
    passageId,
    likes: Number(summary?.likes ?? 0),
    dislikes: Number(summary?.dislikes ?? 0),
    viewerReaction: Number(summary?.viewer_reaction ?? 0) as ReactionValue,
    mode: "database",
  };
}

export async function checkDatabase(): Promise<void> {
  await getDatabase()`SELECT 1`;
}
