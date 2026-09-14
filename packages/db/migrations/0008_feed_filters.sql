BEGIN;

SELECT pg_advisory_xact_lock(1203217641);

-- A cursor retry may replay only the same book/theme selection. Existing rows
-- were unfiltered, represented by [null,null]. Feed history remains global.
ALTER TABLE actor_feed_pages
    ADD COLUMN IF NOT EXISTS filter_key TEXT NOT NULL DEFAULT '[null,null]';

INSERT INTO schema_migrations (version)
VALUES ('0008_feed_filters')
ON CONFLICT (version) DO NOTHING;

COMMIT;
