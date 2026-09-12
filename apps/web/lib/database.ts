import postgres from "postgres";

import type {
  AiContext,
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
  cursor: number,
  limit: number,
): Promise<FeedResponse> {
  const sql = getDatabase();
  const rows = await sql<
    Array<{
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
    }>
  >`
    WITH ranked_passages AS (
      SELECT
        fp.*,
        p.ai_context,
        row_number() OVER (
          PARTITION BY fp.book_id
          ORDER BY fp.quality_score DESC NULLS LAST, md5(fp.id::text), fp.id
        ) AS book_rank
      FROM feed_passages fp
      JOIN passages p ON p.id = fp.id
    )
    SELECT
      fp.id,
      fp.exact_text,
      fp.ai_context,
      fp.author,
      fp.title,
      fp.chapter_title,
      fp.source_url,
      fp.original_publication_year,
      fp.themes,
      count(r.passage_id) FILTER (WHERE r.value = 1) AS likes,
      count(r.passage_id) FILTER (WHERE r.value = -1) AS dislikes,
      max(r.value) FILTER (WHERE r.actor_id = ${actorId}::uuid) AS viewer_reaction
    FROM ranked_passages fp
    LEFT JOIN reactions r ON r.passage_id = fp.id
    GROUP BY
      fp.id,
      fp.exact_text,
      fp.ai_context,
      fp.author,
      fp.title,
      fp.chapter_title,
      fp.source_url,
      fp.original_publication_year,
      fp.themes,
      fp.book_rank,
      fp.quality_score,
      fp.published_at
    ORDER BY fp.book_rank, fp.quality_score DESC NULLS LAST, md5(fp.id::text), fp.id
    LIMIT ${limit}
    OFFSET ${cursor}
  `;

  const items: FeedPassage[] = rows.map((row, index) => ({
    id: row.id,
    feedToken: `${row.id}:${cursor + index}`,
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
    nextCursor: rows.length === limit ? String(cursor + limit) : null,
    mode: "database",
  };
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
