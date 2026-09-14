BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- Preserve all existing v1 outbox and finalized rows. V2 adds a uint32 byte
-- length and UTF-8 JSON array of public reasons to the same commitment header.
-- The worker and independent verifier additionally enforce canonical JSON and
-- exact receipt-to-reason equality; PostgreSQL protects framing and identities.
CREATE OR REPLACE FUNCTION valid_anchor_envelope(
    envelope TEXT, batch_id UUID, receipts INTEGER, root TEXT, previous_root TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
    payload BYTEA;
    magic TEXT;
    json_size BIGINT;
    reasons JSONB;
BEGIN
    IF length(envelope) > 262146 OR envelope !~ '^0x([0-9a-f]{2})+$' THEN RETURN false; END IF;
    payload := decode(substr(envelope, 3), 'hex');
    IF octet_length(payload) < 92 THEN RETURN false; END IF;
    magic := convert_from(substring(payload FROM 1 FOR 8), 'UTF8');
    IF substring(payload FROM 9 FOR 16) <> decode(replace(batch_id::text, '-', ''), 'hex')
       OR get_byte(payload, 24)::bigint * 16777216 + get_byte(payload, 25)::bigint * 65536
          + get_byte(payload, 26)::bigint * 256 + get_byte(payload, 27) <> receipts
       OR substring(payload FROM 29 FOR 32) <> decode(root, 'hex')
       OR substring(payload FROM 61 FOR 32) <> decode(previous_root, 'hex') THEN RETURN false; END IF;
    IF magic = 'GDSANCH1' THEN RETURN octet_length(payload) = 92; END IF;
    IF magic <> 'GDSANCH2' OR octet_length(payload) < 98 THEN RETURN false; END IF;
    json_size := get_byte(payload, 92)::bigint * 16777216 + get_byte(payload, 93)::bigint * 65536
                 + get_byte(payload, 94)::bigint * 256 + get_byte(payload, 95);
    IF json_size <> octet_length(payload) - 96 THEN RETURN false; END IF;
    reasons := convert_from(substring(payload FROM 97), 'UTF8')::jsonb;
    IF jsonb_typeof(reasons) <> 'array' THEN RETURN false; END IF;
    RETURN jsonb_array_length(reasons) = receipts;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;

ALTER TABLE polkadot_anchor_batches DROP CONSTRAINT IF EXISTS polkadot_anchor_batches_envelope_hex_check;
ALTER TABLE polkadot_anchor_batches ADD CONSTRAINT polkadot_anchor_batches_envelope_hex_check
    CHECK (valid_anchor_envelope(envelope_hex, id, receipt_count, root_sha256,
        COALESCE(previous_root_sha256, repeat('0', 64))));

INSERT INTO schema_migrations(version) VALUES ('0009_anchor_rationales') ON CONFLICT DO NOTHING;
COMMIT;
