import { getDatabase } from "@/lib/database";
import type { AnalyticsEvent } from "@/lib/analytics";

let nextPruneAt = 0;

export async function saveAnalyticsEvents(events: AnalyticsEvent[]): Promise<void> {
  const sql = getDatabase();
  const prune = Date.now() >= nextPruneAt;
  await sql.begin(async (transaction) => {
    await transaction`SET LOCAL statement_timeout = '1500ms'`;
    await transaction`SET LOCAL lock_timeout = '500ms'`;
    await transaction`INSERT INTO analytics_events ${transaction(events)} ON CONFLICT (event_id) DO NOTHING`;
    // Bounded maintenance once an hour on active sites. Operators can also run
    // analytics-prune.mjs daily to remove expired rows when traffic is absent.
    if (prune) {
      await transaction`
        DELETE FROM analytics_events WHERE event_id IN (
          SELECT event_id FROM analytics_events
          WHERE received_at < now() - interval '90 days'
          ORDER BY received_at LIMIT 10000 FOR UPDATE SKIP LOCKED
        )
      `;
    }
  });
  if (prune) nextPruneAt = Date.now() + 3_600_000;
}
