# Database

The PostgreSQL schema lives in `migrations/`. Migrations are plain SQL so the
Python pipeline and Next.js application share one source of truth.

Apply all migrations in filename order:

```sh
npm --prefix apps/web run migrate
```

The migrations are safe to run repeatedly. Application code should use
idempotent reaction writes:

```sql
INSERT INTO reactions (actor_id, passage_id, value)
VALUES ($1, $2, $3)
ON CONFLICT (actor_id, passage_id)
DO UPDATE SET value = EXCLUDED.value;
```

The application feed can query `feed_passages`. After migration `0011`, that
view requires published status, an approved exact edition/source tuple, and no
retirement marker. It also controls public verification and source access.

Migration `0007_feed_history.sql` adds functional feed memory keyed by the existing
anonymous actor cookie. `actor_passage_history` stores only the latest time each
passage was served. Unseen passages come first; after the available library has
been served, the least recently served passages return. New imports immediately
take priority. Optional analytics consent does not control this feed memory.

`actor_feed_pages` retains only the most recent page for each actor, allowing an
immediate retry with the same UUID cursor to return the same passage IDs and next
cursor without consuming more unseen passages. Concurrent requests for one actor
are serialized in a transaction. Each nonempty page has a next cursor, including
partial pages at the end of a first pass through the library.

The migration runner applies `0007` automatically in filename order. Apply it
before running the updated web application. Existing users start with empty feed
history; earlier analytics/impression data is not repurposed. Clearing the actor
cookie starts a fresh history. Demo mode keeps bounded process-local history, so
it resets when the server restarts.

Feed concurrency and ordering integration tests can run against a disposable
local database named `feed_test`:

```sh
FEED_TEST_DATABASE_URL=postgres://localhost/feed_test npm --prefix apps/web test -- tests/feed-database.test.ts
```

These tests truncate their fixture tables and reject nonlocal hosts or a database
with any other name. Without this explicit test URL, they are skipped.

Migration `0008_feed_filters.sql` scopes a cached retry page to its book and theme
selection. These public filters combine with AND semantics and restrict published
passages before unseen-first ranking; reading history is shared across selections.
The public `/api/library` catalog lists only books and themes with published quotes
and never creates an actor or updates history. `/api/feed` includes matching and
total published counts. A selection with no matches stays empty; demo fallback is
available only when the entire published database is empty or unconfigured.

Migration `0011_corpus_rights_policy.sql` installs the conservative edition
allowlist, archives nonapproved passages, and preserves permanent retirement
records. It preserves private source and receipt history. Apply the published
policy and this migration together when changing the active corpus.

Migration `0012_anchor_publication_guard.sql` prevents new anchor memberships
for receipts whose passages are no longer public, whose receipt edition differs
from the passage's current edition, or whose preserved source hashes differ from
the approved edition. Every insertion or update to an attempt in `prepared` or
`broadcast` status rechecks the entire batch and its membership count, including
`broadcast` retries. The worker commits that update before its network submission.
This also guards previously prepared batches without changing the worker image.

Keep finalized commitments, receipts, membership, and signed-attempt history.
Updates recording `finalized`, `failed`, or `expired` recovery remain permitted;
the guard must not rewrite already-submitted evidence. An old pending batch that
contains withdrawn material remains blocked and needs a separate reviewed
operational resolution. It must not be deleted or silently rebuilt.

For deployment, verify that no anchoring task is running or pending and that the
schedule will not fire during the change; apply `0011`, then `0012`, before
resuming work. `0012` also waits on the worker's session advisory lock
`1203217642`, after the migration lock `1203217641`; the worker does not acquire
the latter. Coordinate future withdrawals with the worker lock or a paused,
drained schedule. A database trigger cannot revoke bytes already submitted or
make a later independent withdrawal atomic with a network send authorized
earlier. This migration does not enable, deploy, or start a blockchain worker.

Validation on September 13, 2026 executed all eleven ordered migrations on empty
and populated disposable PostgreSQL 18.3 databases using PGlite 0.5.8 with
`pgcrypto`. Sixty-one checks covered approved publication, new-plan and retry
rejection, source and approval drift, incomplete or missing membership,
historical recovery, and migration replay. This validates SQL semantics; it
does not substitute for native concurrent-session or production rollout checks.
