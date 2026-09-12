BEGIN;

-- Serialize concurrent container starts so two instances cannot race on DDL.
SELECT pg_advisory_xact_lock(1203217641);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (btrim(title) <> ''),
    author TEXT NOT NULL CHECK (btrim(author) <> ''),
    author_sort TEXT,
    original_publication_year INTEGER,
    language_code VARCHAR(16) NOT NULL DEFAULT 'en',
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT books_publication_year_reasonable
        CHECK (original_publication_year IS NULL OR original_publication_year BETWEEN -4000 AND 2100)
);

CREATE INDEX IF NOT EXISTS books_author_idx ON books (author_sort, author);

CREATE TABLE IF NOT EXISTS editions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    source_name TEXT NOT NULL DEFAULT 'Standard Ebooks' CHECK (btrim(source_name) <> ''),
    source_url TEXT NOT NULL CHECK (btrim(source_url) <> ''),
    download_url TEXT,
    source_version TEXT,
    source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    normalized_sha256 TEXT CHECK (normalized_sha256 IS NULL OR normalized_sha256 ~ '^[0-9a-f]{64}$'),
    rights_basis TEXT NOT NULL CHECK (btrim(rights_basis) <> ''),
    rights_jurisdiction TEXT NOT NULL DEFAULT 'US' CHECK (btrim(rights_jurisdiction) <> ''),
    retrieved_at TIMESTAMPTZ NOT NULL,
    s3_source_key TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT editions_source_version_unique UNIQUE (source_name, source_url, source_sha256),
    CONSTRAINT editions_id_book_unique UNIQUE (id, book_id)
);

CREATE INDEX IF NOT EXISTS editions_book_id_idx ON editions (book_id);

CREATE TABLE IF NOT EXISTS chapters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
    chapter_index INTEGER NOT NULL CHECK (chapter_index >= 0),
    title TEXT,
    source_path TEXT,
    source_start BIGINT,
    source_end BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chapters_edition_order_unique UNIQUE (edition_id, chapter_index),
    CONSTRAINT chapters_id_edition_unique UNIQUE (id, edition_id),
    CONSTRAINT chapters_source_range_valid CHECK (
        (source_start IS NULL AND source_end IS NULL)
        OR (source_start IS NOT NULL AND source_end IS NOT NULL AND source_start >= 0 AND source_end > source_start)
    )
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    edition_id UUID REFERENCES editions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    source_type TEXT NOT NULL DEFAULT 'standard_ebooks',
    model_provider TEXT,
    model_name TEXT,
    prompt_version TEXT,
    input_sha256 TEXT CHECK (input_sha256 IS NULL OR input_sha256 ~ '^[0-9a-f]{64}$'),
    output_sha256 TEXT CHECK (output_sha256 IS NULL OR output_sha256 ~ '^[0-9a-f]{64}$'),
    config JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config) = 'object'),
    metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pipeline_runs_time_order_valid CHECK (
        completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at
    )
);

CREATE INDEX IF NOT EXISTS pipeline_runs_edition_created_idx
    ON pipeline_runs (edition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS pipeline_runs_status_idx
    ON pipeline_runs (status) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS passages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL,
    edition_id UUID NOT NULL,
    chapter_id UUID NOT NULL,
    pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE SET NULL,
    exact_text TEXT NOT NULL CHECK (btrim(exact_text) <> ''),
    source_start BIGINT NOT NULL CHECK (source_start >= 0),
    source_end BIGINT NOT NULL,
    start_sentence INTEGER,
    end_sentence INTEGER,
    word_count INTEGER NOT NULL CHECK (word_count > 0),
    quality_score REAL NOT NULL DEFAULT 0.5 CHECK (quality_score >= 0 AND quality_score <= 1),
    hook_score SMALLINT CHECK (hook_score BETWEEN 1 AND 5),
    clarity_score SMALLINT CHECK (clarity_score BETWEEN 1 AND 5),
    prose_score SMALLINT CHECK (prose_score BETWEEN 1 AND 5),
    context_dependence_score SMALLINT CHECK (context_dependence_score BETWEEN 1 AND 5),
    themes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(themes) = 'array'),
    content_flags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(content_flags) = 'array'),
    status TEXT NOT NULL DEFAULT 'candidate'
        CHECK (status IN ('candidate', 'in_review', 'approved', 'rejected', 'published', 'archived')),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT passages_source_range_valid CHECK (source_end > source_start),
    CONSTRAINT passages_sentence_range_valid CHECK (
        (start_sentence IS NULL AND end_sentence IS NULL)
        OR (start_sentence IS NOT NULL AND end_sentence IS NOT NULL AND start_sentence >= 0 AND end_sentence >= start_sentence)
    ),
    CONSTRAINT passages_publication_time_valid CHECK (status <> 'published' OR published_at IS NOT NULL),
    CONSTRAINT passages_edition_book_fk
        FOREIGN KEY (edition_id, book_id) REFERENCES editions(id, book_id) ON DELETE CASCADE,
    CONSTRAINT passages_chapter_edition_fk
        FOREIGN KEY (chapter_id, edition_id) REFERENCES chapters(id, edition_id)
        ON DELETE CASCADE,
    -- Offsets are zero-based positions within this chapter's normalized text.
    CONSTRAINT passages_chapter_range_unique
        UNIQUE (edition_id, chapter_id, source_start, source_end)
);

CREATE INDEX IF NOT EXISTS passages_feed_idx
    ON passages (published_at DESC, quality_score DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS passages_book_idx ON passages (book_id, status);
CREATE INDEX IF NOT EXISTS passages_chapter_idx ON passages (chapter_id, edition_id);
CREATE INDEX IF NOT EXISTS passages_themes_gin_idx ON passages USING GIN (themes);
CREATE INDEX IF NOT EXISTS passages_content_flags_gin_idx ON passages USING GIN (content_flags);

CREATE TABLE IF NOT EXISTS actors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL DEFAULT 'anonymous' CHECK (kind IN ('anonymous', 'registered', 'system')),
    external_subject TEXT UNIQUE,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reactions (
    actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
    passage_id UUID NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
    value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_id, passage_id)
);

CREATE INDEX IF NOT EXISTS reactions_passage_value_idx ON reactions (passage_id, value);

CREATE TABLE IF NOT EXISTS impressions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id UUID NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
    passage_id UUID NOT NULL REFERENCES passages(id) ON DELETE CASCADE,
    feed_session_id UUID NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    served_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT impressions_session_passage_unique UNIQUE (actor_id, feed_session_id, passage_id)
);

CREATE INDEX IF NOT EXISTS impressions_actor_recent_idx
    ON impressions (actor_id, served_at DESC);
CREATE INDEX IF NOT EXISTS impressions_passage_served_idx
    ON impressions (passage_id, served_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS books_set_updated_at ON books;
CREATE TRIGGER books_set_updated_at
BEFORE UPDATE ON books
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS editions_set_updated_at ON editions;
CREATE TRIGGER editions_set_updated_at
BEFORE UPDATE ON editions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS passages_set_updated_at ON passages;
CREATE TRIGGER passages_set_updated_at
BEFORE UPDATE ON passages
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS reactions_set_updated_at ON reactions;
CREATE TRIGGER reactions_set_updated_at
BEFORE UPDATE ON reactions
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE VIEW feed_passages AS
SELECT
    p.id,
    p.book_id,
    b.title,
    b.author,
    b.original_publication_year,
    p.exact_text,
    p.quality_score,
    p.themes,
    p.content_flags,
    c.title AS chapter_title,
    e.source_url,
    p.published_at
FROM passages AS p
JOIN books AS b ON b.id = p.book_id
JOIN editions AS e ON e.id = p.edition_id
LEFT JOIN chapters AS c ON c.id = p.chapter_id
WHERE p.status = 'published';

INSERT INTO schema_migrations (version)
VALUES ('0001_initial')
ON CONFLICT (version) DO NOTHING;

COMMIT;
