import { createDatabaseClient } from "./database-config.mjs";

// Run daily when the site is quiet as well as the hourly ingestion cleanup.
// Batches keep transactions short and avoid locking readers' content tables.
const sql = createDatabaseClient();
let deleted = 0;
try {
  while (true) {
    const count = await sql.begin(async (tx) => {
      await tx`SET LOCAL statement_timeout = '10s'`;
      await tx`SET LOCAL lock_timeout = '1s'`;
      const rows = await tx`
        DELETE FROM analytics_events WHERE event_id IN (
          SELECT event_id FROM analytics_events
          WHERE received_at < now() - interval '90 days'
          ORDER BY received_at LIMIT 10000 FOR UPDATE SKIP LOCKED
        ) RETURNING event_id
      `;
      return rows.length;
    });
    deleted += count;
    if (count < 10000) break;
  }
  process.stdout.write(`Removed ${deleted} expired analytics events.\n`);
} catch {
  process.stderr.write("Analytics cleanup failed. Check database connectivity and migrations.\n");
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
