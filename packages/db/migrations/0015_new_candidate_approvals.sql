BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- Exact reviewed source identities: docs/legal/new-candidate-edition-audit-2026-09-13.md.
-- Temporary expected rows allow replay without replacing a previous rights decision.
CREATE TEMP TABLE reviewed_candidate_approvals_0015 (
    edition_id UUID PRIMARY KEY,
    book_id UUID NOT NULL,
    source_sha256 TEXT NOT NULL,
    normalized_sha256 TEXT NOT NULL,
    source_url TEXT NOT NULL
) ON COMMIT DROP;
INSERT INTO reviewed_candidate_approvals_0015
    (edition_id, book_id, source_sha256, normalized_sha256, source_url)
VALUES
    ('08ae9ada-5f7b-5f2a-9c98-fc178d26d6e7', '43ebbdc6-f31f-5ed4-969d-547243ed3034', '657cde76d7f1a38bc34da76a95f96067dd9a0884ea24a5592876c30223af75b6', '7e4afc621ab40aaf08e990fdac1f50f298579a74d88b10ecbc36a99ed287c070', 'https://www.gutenberg.org/ebooks/54984'),
    ('3503983f-44a3-5844-aae7-340441c67a9e', 'de78b3a6-f333-5400-9569-289c1dbc0444', 'e612d49329304423f453db636db31369a51240a45d4e82bd5d6e3588208219fb', '5e31961bd5d14009cf3ce9379dcd952f0a9130f67bc8b1617eeb0237973c80b4', 'https://www.gutenberg.org/ebooks/51783'),
    ('ea5265f9-086d-5e65-9e4d-8209348b119e', 'cfe2202c-4303-5826-8824-908291deae22', 'ba5c406376024fe1907efbc95b7bc53e2866c591c6773378ca5ad942e3e37c1a', '8f976854371839e905699ebdb0920d3694bd873c73a6440a9e5671d92b7f5568', 'https://www.gutenberg.org/ebooks/52869');

INSERT INTO corpus_publication_approvals
    (edition_id, book_id, source_sha256, normalized_sha256, source_url)
SELECT edition_id, book_id, source_sha256, normalized_sha256, source_url
FROM reviewed_candidate_approvals_0015
ON CONFLICT (edition_id) DO NOTHING;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM reviewed_candidate_approvals_0015 expected
        LEFT JOIN corpus_publication_approvals actual
          ON actual.edition_id = expected.edition_id
          AND actual.book_id = expected.book_id
          AND actual.source_sha256 = expected.source_sha256
          AND actual.normalized_sha256 = expected.normalized_sha256
          AND actual.source_url = expected.source_url
        WHERE actual.edition_id IS NULL
    ) THEN
        RAISE EXCEPTION 'Cannot approve candidates: existing source identity differs';
    END IF;
    IF EXISTS (
        SELECT 1 FROM reviewed_candidate_approvals_0015 expected
        JOIN edition_retirements retired ON retired.edition_id = expected.edition_id
    ) THEN
        RAISE EXCEPTION 'Cannot approve a permanently retired edition';
    END IF;
END;
$$;

INSERT INTO schema_migrations(version)
VALUES ('0015_new_candidate_approvals')
ON CONFLICT DO NOTHING;
COMMIT;
