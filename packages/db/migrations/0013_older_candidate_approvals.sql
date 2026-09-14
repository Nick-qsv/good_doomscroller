BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- Exact source approvals: docs/legal/older-candidate-edition-audit-2026-09-13.md.
-- Existing retirements and source identity guards remain authoritative.
INSERT INTO corpus_publication_approvals
    (edition_id, book_id, source_sha256, normalized_sha256, source_url)
VALUES
    ('c29a4a85-d9bc-5b03-b944-a8138d38ae62', '21b8c81a-5344-50d1-9ef7-8c866c874bd8', '9c467182c78bd246ab05ce5bef11c32cb748ebaa5622dedc4bd4c02a8a0fff90', '2be0a3f316e0d2accaa60fdecaac2145aba07f9a96b95c73b7fed9d343d02525', 'https://www.gutenberg.org/ebooks/147'),
    ('719e37d2-7aa2-5d90-a1df-517d2e88ecbf', '313393d5-3113-52e2-887b-26bb871d0297', '5d46a4d5434adff0d949ef6a71168082526dce726c0be50b0149ccf31016c28f', 'b31740ce71e8118459242db6b24741760db65da1e81192e1d96da72bd5ff8d0b', 'https://www.gutenberg.org/ebooks/67363'),
    ('f153534c-5cc9-56d0-a10b-59a9cd03ce4f', '2c4b79aa-ee6c-5652-b647-d1335cd3f8aa', '1b1ea052d47e5177c5b8a75b06cea7d2ef4295e6856d695293dddc9a9ce60e05', 'd43472c4b18c0b5bb661c15f97003f0f32f469f7aa7494b6f78886ff51bdc2c7', 'https://www.gutenberg.org/ebooks/15399')
ON CONFLICT (edition_id) DO NOTHING;
COMMIT;
