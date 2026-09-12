BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- One durable original and normalized snapshot for each content-addressed edition.
CREATE TABLE IF NOT EXISTS edition_sources (
    edition_id UUID PRIMARY KEY REFERENCES editions(id) ON DELETE RESTRICT,
    source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    normalized_sha256 TEXT NOT NULL CHECK (normalized_sha256 ~ '^[0-9a-f]{64}$'),
    normalization_version TEXT NOT NULL CHECK (normalization_version = '1'),
    original_bytes BYTEA NOT NULL,
    normalized_chapters JSONB NOT NULL CHECK (jsonb_typeof(normalized_chapters) = 'array'),
    preserved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (encode(digest(original_bytes, 'sha256'), 'hex') = source_sha256)
);

-- The exact UTF-8 JSON bytes define the receipt hash, making it reproducible outside SQL.
CREATE TABLE IF NOT EXISTS passage_verification_receipts (
    sequence BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    passage_id UUID NOT NULL REFERENCES passages(id) ON DELETE RESTRICT,
    edition_id UUID NOT NULL REFERENCES edition_sources(edition_id) ON DELETE RESTRICT,
    receipt_json TEXT NOT NULL CHECK (jsonb_typeof(receipt_json::jsonb) = 'object'),
    receipt_sha256 TEXT NOT NULL UNIQUE CHECK (receipt_sha256 ~ '^[0-9a-f]{64}$'),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (encode(digest(receipt_json, 'sha256'), 'hex') = receipt_sha256)
);
CREATE INDEX IF NOT EXISTS passage_verification_receipts_passage_idx
    ON passage_verification_receipts(passage_id, sequence DESC);

CREATE OR REPLACE FUNCTION reject_provenance_mutation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Preserved sources and verification receipts are append-only';
END;
$$;
DROP TRIGGER IF EXISTS edition_sources_immutable ON edition_sources;
CREATE TRIGGER edition_sources_immutable BEFORE UPDATE OR DELETE ON edition_sources
    FOR EACH ROW EXECUTE FUNCTION reject_provenance_mutation();
DROP TRIGGER IF EXISTS verification_receipts_immutable ON passage_verification_receipts;
CREATE TRIGGER verification_receipts_immutable BEFORE UPDATE OR DELETE ON passage_verification_receipts
    FOR EACH ROW EXECUTE FUNCTION reject_provenance_mutation();
DROP TRIGGER IF EXISTS edition_sources_no_truncate ON edition_sources;
CREATE TRIGGER edition_sources_no_truncate BEFORE TRUNCATE ON edition_sources
    FOR EACH STATEMENT EXECUTE FUNCTION reject_provenance_mutation();
DROP TRIGGER IF EXISTS verification_receipts_no_truncate ON passage_verification_receipts;
CREATE TRIGGER verification_receipts_no_truncate BEFORE TRUNCATE ON passage_verification_receipts
    FOR EACH STATEMENT EXECUTE FUNCTION reject_provenance_mutation();

INSERT INTO schema_migrations(version) VALUES ('0002_verification') ON CONFLICT DO NOTHING;
COMMIT;
