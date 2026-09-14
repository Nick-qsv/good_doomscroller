BEGIN;

SELECT pg_advisory_xact_lock(1203217641);

-- Functional feed memory, independent of optional analytics/impression events.
-- One row per browser actor and served passage; no request or view event log.
CREATE TABLE IF NOT EXISTS actor_passage_history (
    actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
    passage_id UUID NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
    last_served_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (actor_id, passage_id)
);

CREATE INDEX IF NOT EXISTS actor_passage_history_oldest_idx
    ON actor_passage_history (actor_id, last_served_at, passage_id);

-- Retain only the most recent page per actor so retrying a failed fetch does
-- not advance its unseen history again. This does not grow with scroll depth.
CREATE TABLE IF NOT EXISTS actor_feed_pages (
    actor_id UUID PRIMARY KEY REFERENCES actors(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    passage_ids UUID[] NOT NULL CHECK (cardinality(passage_ids) BETWEEN 1 AND 20),
    next_cursor UUID NOT NULL,
    revisited BOOLEAN NOT NULL
);

INSERT INTO schema_migrations (version)
VALUES ('0007_feed_history')
ON CONFLICT (version) DO NOTHING;

COMMIT;
