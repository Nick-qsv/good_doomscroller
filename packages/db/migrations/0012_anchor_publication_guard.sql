BEGIN;
SELECT pg_advisory_xact_lock(1203217641);
-- Wait for any worker already holding its session lock to finish. A database
-- check cannot recall an extrinsic already submitted to the public network.
SELECT pg_advisory_xact_lock(1203217642);

-- Receipts stay immutable and available for private audit and chain recovery.
-- A new commitment may use only a currently published, approved exact source.
CREATE OR REPLACE FUNCTION anchor_receipt_is_public(receipt_sequence BIGINT)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM passage_verification_receipts r
        JOIN passages p ON p.id = r.passage_id AND p.edition_id = r.edition_id
        JOIN feed_passages f ON f.id = p.id
        JOIN editions e ON e.id = r.edition_id AND e.book_id = p.book_id
        JOIN edition_sources s ON s.edition_id = e.id
            AND s.source_sha256 = e.source_sha256
            AND s.normalized_sha256 = e.normalized_sha256
        WHERE r.sequence = receipt_sequence
    );
$$;

CREATE OR REPLACE FUNCTION require_public_anchor_membership() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT anchor_receipt_is_public(NEW.receipt_sequence) THEN
        RAISE EXCEPTION 'Anchor receipt % is not eligible for publication', NEW.receipt_sequence;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS polkadot_anchor_memberships_require_publication ON polkadot_anchor_memberships;
CREATE TRIGGER polkadot_anchor_memberships_require_publication
    BEFORE INSERT ON polkadot_anchor_memberships
    FOR EACH ROW EXECUTE FUNCTION require_public_anchor_membership();

CREATE OR REPLACE FUNCTION require_public_anchor_attempt() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    expected_count INTEGER;
    actual_count BIGINT;
BEGIN
    -- Include broadcast -> broadcast retries. Finalized, expired and failed
    -- recovery updates must remain possible for bytes sent before withdrawal.
    IF NEW.status IN ('prepared', 'broadcast') THEN
        SELECT receipt_count INTO expected_count FROM polkadot_anchor_batches WHERE id = NEW.batch_id;
        SELECT count(*) INTO actual_count FROM polkadot_anchor_memberships WHERE batch_id = NEW.batch_id;
        IF expected_count IS NULL OR actual_count <> expected_count OR EXISTS (
            SELECT 1 FROM polkadot_anchor_memberships m
            WHERE m.batch_id = NEW.batch_id AND NOT anchor_receipt_is_public(m.receipt_sequence)
        ) THEN
            RAISE EXCEPTION 'Anchor batch % is incomplete or not eligible for publication', NEW.batch_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS polkadot_anchor_attempts_require_publication ON polkadot_anchor_attempts;
CREATE TRIGGER polkadot_anchor_attempts_require_publication
    BEFORE INSERT OR UPDATE ON polkadot_anchor_attempts
    FOR EACH ROW EXECUTE FUNCTION require_public_anchor_attempt();

INSERT INTO schema_migrations(version) VALUES ('0012_anchor_publication_guard') ON CONFLICT DO NOTHING;
COMMIT;
