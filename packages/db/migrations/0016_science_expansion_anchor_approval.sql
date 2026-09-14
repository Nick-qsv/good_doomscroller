BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- Preserve the original one-time approval while permitting the separately
-- pinned science-expansion approval. The worker still has to authenticate the
-- exact approval artifact hash, receipt set, payload, predecessor and fee cap.
CREATE UNIQUE INDEX IF NOT EXISTS polkadot_anchor_one_time_approval_once
    ON polkadot_anchor_attempts ((prepared_json->>'oneTimeApprovalId'))
    WHERE prepared_json ? 'oneTimeApprovalId';
CREATE UNIQUE INDEX IF NOT EXISTS polkadot_anchor_one_time_digest_once
    ON polkadot_anchor_attempts ((prepared_json->>'oneTimeApprovalSha256'))
    WHERE prepared_json ? 'oneTimeApprovalSha256';

ALTER TABLE polkadot_anchor_attempts DROP CONSTRAINT IF EXISTS polkadot_anchor_one_time_markers;
ALTER TABLE polkadot_anchor_attempts ADD CONSTRAINT polkadot_anchor_one_time_markers CHECK (
    (NOT (prepared_json ? 'oneTimeApprovalId') AND NOT (prepared_json ? 'oneTimeApprovalSha256'))
    OR ((prepared_json->>'oneTimeApprovalId' IN (
            'rationales-2026-09-13',
            'science-expansion-2026-09-13'
        )
        AND jsonb_typeof(prepared_json->'oneTimeApprovalId') = 'string'
        AND jsonb_typeof(prepared_json->'oneTimeApprovalSha256') = 'string'
        AND prepared_json->>'oneTimeApprovalSha256' ~ '^[0-9a-f]{64}$') IS TRUE)
);

INSERT INTO schema_migrations(version)
VALUES ('0016_science_expansion_anchor_approval')
ON CONFLICT DO NOTHING;
COMMIT;
