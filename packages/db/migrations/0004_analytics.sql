BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- Anonymous, short-lived reading sessions; deliberately no actor, IP, URL,
-- free-form properties, quotation text, or persistent visitor identifier.
CREATE TABLE IF NOT EXISTS analytics_events (
    event_id UUID PRIMARY KEY,
    session_id UUID NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_name TEXT NOT NULL CHECK (event_name IN (
        'page_view', 'engagement', 'passage_view', 'passage_read',
        'ai_context_view', 'reaction', 'verification_open', 'source_open',
        'proof_expand', 'proof_download', 'source_download', 'feed_load',
        'feed_error', 'reaction_error', 'feed_end', 'back_to_top'
    )),
    path TEXT NOT NULL CHECK (path IN ('/', '/passages/:id/verification')),
    passage_id TEXT CHECK (length(passage_id) <= 80),
    value INTEGER CHECK (value BETWEEN -1 AND 1000000),
    referrer_host TEXT CHECK (length(referrer_host) <= 253),
    device TEXT NOT NULL CHECK (device IN ('mobile', 'tablet', 'desktop', 'unknown')),
    browser TEXT NOT NULL CHECK (browser IN ('Chrome', 'Safari', 'Firefox', 'Edge', 'Other'))
);
CREATE INDEX IF NOT EXISTS analytics_events_received_idx ON analytics_events (received_at);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events (session_id, received_at);
CREATE INDEX IF NOT EXISTS analytics_events_content_idx ON analytics_events (passage_id, received_at)
    WHERE passage_id IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('0004_analytics') ON CONFLICT DO NOTHING;
COMMIT;
