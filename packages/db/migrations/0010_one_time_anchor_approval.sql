BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- One approved operation grants one durable attempt, including failed or
-- expired attempts. Recovery may only reuse that attempt's exact signed bytes.
CREATE UNIQUE INDEX IF NOT EXISTS polkadot_anchor_one_time_approval_once
    ON polkadot_anchor_attempts ((prepared_json->>'oneTimeApprovalId'))
    WHERE prepared_json ? 'oneTimeApprovalId';
CREATE UNIQUE INDEX IF NOT EXISTS polkadot_anchor_one_time_digest_once
    ON polkadot_anchor_attempts ((prepared_json->>'oneTimeApprovalSha256'))
    WHERE prepared_json ? 'oneTimeApprovalSha256';

ALTER TABLE polkadot_anchor_attempts DROP CONSTRAINT IF EXISTS polkadot_anchor_one_time_markers;
ALTER TABLE polkadot_anchor_attempts ADD CONSTRAINT polkadot_anchor_one_time_markers CHECK (
    (NOT (prepared_json ? 'oneTimeApprovalId') AND NOT (prepared_json ? 'oneTimeApprovalSha256'))
    OR ((prepared_json->>'oneTimeApprovalId' = 'rationales-2026-09-13'
        AND jsonb_typeof(prepared_json->'oneTimeApprovalId') = 'string'
        AND jsonb_typeof(prepared_json->'oneTimeApprovalSha256') = 'string'
        AND prepared_json->>'oneTimeApprovalSha256' ~ '^[0-9a-f]{64}$') IS TRUE)
);

INSERT INTO schema_migrations(version) VALUES ('0010_one_time_anchor_approval') ON CONFLICT DO NOTHING;
COMMIT;
