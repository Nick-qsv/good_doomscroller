BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- Interpretation is kept outside the immutable source and quotation receipts.
ALTER TABLE passages ADD COLUMN IF NOT EXISTS ai_context JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'passages'::regclass AND conname = 'passages_ai_context_valid'
    ) THEN
        ALTER TABLE passages ADD CONSTRAINT passages_ai_context_valid CHECK (
            ai_context IS NULL OR (
                jsonb_typeof(ai_context) = 'object'
                AND ai_context ?& ARRAY['text', 'generatedBy', 'generatedAt']
                AND ai_context - ARRAY['text', 'generatedBy', 'generatedAt'] = '{}'::jsonb
                AND jsonb_typeof(ai_context->'text') = 'string'
                AND char_length(ai_context->>'text') BETWEEN 1 AND 600
                AND btrim(ai_context->>'text') <> ''
                AND ai_context->>'text' = btrim(ai_context->>'text')
                AND jsonb_typeof(ai_context->'generatedBy') = 'string'
                AND ai_context->>'generatedBy' = 'AI'
                AND jsonb_typeof(ai_context->'generatedAt') = 'string'
                AND ai_context->>'generatedAt' ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)$'
                AND (ai_context->>'generatedAt')::timestamptz IS NOT NULL
            )
        );
    END IF;
END;
$$;

INSERT INTO schema_migrations(version) VALUES ('0003_ai_context') ON CONFLICT DO NOTHING;
COMMIT;
