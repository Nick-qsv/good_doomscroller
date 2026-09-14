import { getDatabase } from "@/lib/database";
import type { LibraryResponse } from "@/lib/types";

// Public library metadata never creates an actor or changes reading history.
export async function getDatabaseLibrary(): Promise<LibraryResponse> {
  const [catalog] = await getDatabase()<Array<Omit<LibraryResponse, "mode">>>`
    WITH published AS MATERIALIZED (
      SELECT id, book_id, title, author, themes FROM feed_passages
    ), book_counts AS (
      SELECT book_id AS id, title, author, count(*)::integer AS count
      FROM published GROUP BY book_id, title, author
    ), theme_counts AS (
      SELECT theme.name, count(DISTINCT p.id)::integer AS count
      FROM published p
      CROSS JOIN LATERAL jsonb_array_elements_text(p.themes) AS theme(name)
      WHERE btrim(theme.name) <> ''
      GROUP BY theme.name
    )
    SELECT
      COALESCE((SELECT jsonb_agg(to_jsonb(book_counts) ORDER BY title, author, id)
        FROM book_counts), '[]'::jsonb) AS books,
      COALESCE((SELECT jsonb_agg(to_jsonb(theme_counts) ORDER BY name)
        FROM theme_counts), '[]'::jsonb) AS themes,
      (SELECT count(*)::integer FROM published) AS total
  `;
  return { ...catalog, mode: "database" };
}
