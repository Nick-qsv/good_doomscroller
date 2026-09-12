BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- A pending batch is durable before signing. Its identity, membership and
-- commitment never change; only successful finalization may complete it.
CREATE TABLE IF NOT EXISTS polkadot_anchor_batches (
    id UUID PRIMARY KEY,
    sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE NOT NULL,
    previous_batch_id UUID REFERENCES polkadot_anchor_batches(id) ON DELETE RESTRICT,
    previous_root_sha256 TEXT CHECK (previous_root_sha256 ~ '^[0-9a-f]{64}$'),
    root_sha256 TEXT UNIQUE NOT NULL CHECK (root_sha256 ~ '^[0-9a-f]{64}$'),
    receipt_count INTEGER NOT NULL CHECK (receipt_count BETWEEN 1 AND 100000),
    first_receipt_sequence BIGINT NOT NULL REFERENCES passage_verification_receipts(sequence) ON DELETE RESTRICT,
    last_receipt_sequence BIGINT NOT NULL REFERENCES passage_verification_receipts(sequence) ON DELETE RESTRICT,
    manifest_json TEXT NOT NULL CHECK (jsonb_typeof(manifest_json::jsonb) = 'object'),
    envelope_hex TEXT NOT NULL CHECK (envelope_hex ~ '^0x[0-9a-f]{184}$'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'finalized')),
    genesis_hash TEXT NOT NULL CHECK (genesis_hash = '0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f'),
    signer_address TEXT NOT NULL CHECK (signer_address = '12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finalized_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    block_hash TEXT CHECK (block_hash ~ '^0x[0-9a-f]{64}$'),
    block_number BIGINT CHECK (block_number >= 0),
    extrinsic_hash TEXT CHECK (extrinsic_hash ~ '^0x[0-9a-f]{64}$'),
    extrinsic_index INTEGER CHECK (extrinsic_index >= 0),
    event_index INTEGER CHECK (event_index >= 0),
    finalized_head_hash TEXT CHECK (finalized_head_hash ~ '^0x[0-9a-f]{64}$'),
    CHECK (first_receipt_sequence <= last_receipt_sequence),
    CHECK ((previous_batch_id IS NULL) = (previous_root_sha256 IS NULL)),
    CHECK (previous_batch_id IS DISTINCT FROM id),
    CHECK (status <> 'finalized' OR (
        finalized_at IS NOT NULL AND block_hash IS NOT NULL AND block_number IS NOT NULL
        AND extrinsic_hash IS NOT NULL AND extrinsic_index IS NOT NULL AND event_index IS NOT NULL
        AND finalized_head_hash IS NOT NULL
    ))
);
-- At most one unfinished batch; the worker serializes jobs with a session lock.
CREATE UNIQUE INDEX IF NOT EXISTS polkadot_anchor_one_pending_idx
    ON polkadot_anchor_batches ((true)) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS polkadot_anchor_one_successor_idx
    ON polkadot_anchor_batches (previous_batch_id) WHERE previous_batch_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS polkadot_anchor_one_first_idx
    ON polkadot_anchor_batches ((true)) WHERE previous_batch_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS verification_receipts_sequence_hash_idx
    ON passage_verification_receipts (sequence, receipt_sha256);
CREATE TABLE IF NOT EXISTS polkadot_anchor_memberships (
    batch_id UUID NOT NULL REFERENCES polkadot_anchor_batches(id) ON DELETE RESTRICT,
    receipt_sequence BIGINT PRIMARY KEY REFERENCES passage_verification_receipts(sequence) ON DELETE RESTRICT,
    receipt_sha256 TEXT NOT NULL REFERENCES passage_verification_receipts(receipt_sha256) ON DELETE RESTRICT,
    leaf_index INTEGER NOT NULL CHECK (leaf_index >= 0),
    proof JSONB NOT NULL CHECK (jsonb_typeof(proof) = 'object'),
    UNIQUE (batch_id, leaf_index)
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'polkadot_membership_receipt_pair') THEN
        ALTER TABLE polkadot_anchor_memberships ADD CONSTRAINT polkadot_membership_receipt_pair
            FOREIGN KEY (receipt_sequence, receipt_sha256)
            REFERENCES passage_verification_receipts(sequence, receipt_sha256) ON DELETE RESTRICT;
    END IF;
END $$;

-- Never broadcast before the exact signed bytes and recovery inputs are saved.
-- Signed public transactions are not signing keys. No wallet secret belongs here.
CREATE TABLE IF NOT EXISTS polkadot_anchor_attempts (
    id UUID PRIMARY KEY,
    batch_id UUID NOT NULL REFERENCES polkadot_anchor_batches(id) ON DELETE RESTRICT,
    extrinsic_hash TEXT UNIQUE NOT NULL CHECK (extrinsic_hash ~ '^0x[0-9a-f]{64}$'),
    signed_extrinsic_hex TEXT NOT NULL CHECK (signed_extrinsic_hex ~ '^0x([0-9a-f]{2})+$'),
    prepared_json JSONB NOT NULL CHECK (jsonb_typeof(prepared_json) = 'object'),
    nonce BIGINT NOT NULL CHECK (nonce >= 0),
    era_birth BIGINT NOT NULL CHECK (era_birth >= 0),
    era_death BIGINT NOT NULL CHECK (era_death > era_birth),
    estimated_fee_planck NUMERIC(30,0) NOT NULL CHECK (estimated_fee_planck > 0),
    fee_paid_planck NUMERIC(30,0) CHECK (fee_paid_planck >= 0),
    status TEXT NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared', 'broadcast', 'finalized', 'failed', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    broadcast_at TIMESTAMPTZ,
    finalized_at TIMESTAMPTZ,
    error_code TEXT CHECK (length(error_code) <= 200)
);
CREATE INDEX IF NOT EXISTS polkadot_anchor_attempts_batch_idx ON polkadot_anchor_attempts (batch_id, created_at);
CREATE INDEX IF NOT EXISTS polkadot_anchor_attempts_budget_idx ON polkadot_anchor_attempts (created_at);

CREATE OR REPLACE FUNCTION protect_anchor_batch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status = 'finalized' OR
       (to_jsonb(NEW) - ARRAY['status','finalized_at','verified_at','block_hash','block_number','extrinsic_hash','extrinsic_index','event_index','finalized_head_hash'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','finalized_at','verified_at','block_hash','block_number','extrinsic_hash','extrinsic_index','event_index','finalized_head_hash']) THEN
        RAISE EXCEPTION 'Anchor commitments and finalized evidence are immutable';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION protect_anchor_attempt() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('finalized','failed','expired') OR
       (to_jsonb(NEW) - ARRAY['status','broadcast_at','finalized_at','error_code','fee_paid_planck'])
       IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['status','broadcast_at','finalized_at','error_code','fee_paid_planck']) THEN
        RAISE EXCEPTION 'Prepared transactions and completed attempts are immutable';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS polkadot_anchor_batches_update ON polkadot_anchor_batches;
CREATE TRIGGER polkadot_anchor_batches_update BEFORE UPDATE ON polkadot_anchor_batches
    FOR EACH ROW EXECUTE FUNCTION protect_anchor_batch();
DROP TRIGGER IF EXISTS polkadot_anchor_attempts_update ON polkadot_anchor_attempts;
CREATE TRIGGER polkadot_anchor_attempts_update BEFORE UPDATE ON polkadot_anchor_attempts
    FOR EACH ROW EXECUTE FUNCTION protect_anchor_attempt();
DROP TRIGGER IF EXISTS polkadot_anchor_memberships_immutable ON polkadot_anchor_memberships;
CREATE TRIGGER polkadot_anchor_memberships_immutable BEFORE UPDATE OR DELETE ON polkadot_anchor_memberships
    FOR EACH ROW EXECUTE FUNCTION reject_provenance_mutation();
DROP TRIGGER IF EXISTS polkadot_anchor_batches_no_delete ON polkadot_anchor_batches;
CREATE TRIGGER polkadot_anchor_batches_no_delete BEFORE DELETE ON polkadot_anchor_batches
    FOR EACH ROW EXECUTE FUNCTION reject_provenance_mutation();
DROP TRIGGER IF EXISTS polkadot_anchor_attempts_no_delete ON polkadot_anchor_attempts;
CREATE TRIGGER polkadot_anchor_attempts_no_delete BEFORE DELETE ON polkadot_anchor_attempts
    FOR EACH ROW EXECUTE FUNCTION reject_provenance_mutation();
DROP TRIGGER IF EXISTS polkadot_anchor_batches_no_truncate ON polkadot_anchor_batches;
CREATE TRIGGER polkadot_anchor_batches_no_truncate BEFORE TRUNCATE ON polkadot_anchor_batches
    FOR EACH STATEMENT EXECUTE FUNCTION reject_provenance_mutation();
DROP TRIGGER IF EXISTS polkadot_anchor_memberships_no_truncate ON polkadot_anchor_memberships;
CREATE TRIGGER polkadot_anchor_memberships_no_truncate BEFORE TRUNCATE ON polkadot_anchor_memberships
    FOR EACH STATEMENT EXECUTE FUNCTION reject_provenance_mutation();
DROP TRIGGER IF EXISTS polkadot_anchor_attempts_no_truncate ON polkadot_anchor_attempts;
CREATE TRIGGER polkadot_anchor_attempts_no_truncate BEFORE TRUNCATE ON polkadot_anchor_attempts
    FOR EACH STATEMENT EXECUTE FUNCTION reject_provenance_mutation();

INSERT INTO schema_migrations(version) VALUES ('0005_anchoring') ON CONFLICT DO NOTHING;
COMMIT;
