BEGIN;
SELECT pg_advisory_xact_lock(1203217641);

-- No edition FK: approvals and permanent retirements also apply before the
-- first import. These are operational publication decisions, not worldwide
-- copyright determinations. Keep in sync with scripts/publication-policy.json.
CREATE TABLE IF NOT EXISTS corpus_publication_approvals (
    edition_id UUID PRIMARY KEY,
    book_id UUID NOT NULL,
    source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
    normalized_sha256 TEXT NOT NULL CHECK (normalized_sha256 ~ '^[0-9a-f]{64}$'),
    source_url TEXT NOT NULL,
    policy_version TEXT NOT NULL DEFAULT '2026-09-13',
    approved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS edition_retirements (
    edition_id UUID PRIMARY KEY,
    reason TEXT NOT NULL,
    retired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO corpus_publication_approvals
    (edition_id, book_id, source_sha256, normalized_sha256, source_url)
VALUES
    ('9640f338-8d93-5501-bbef-6f9a00e9e556', '8214c5c8-3e5e-5bb6-b3ae-312f1aa36580', '7e2937e414d27ec2ee9bced09e1f9066191732aeaa15cc44ad9d85d687d8d00b', '5e2b15a644810926406f3c7b9a5f8554bc7a59f66e0ca6af1f505d2a4237c411', 'https://www.gutenberg.org/ebooks/2010'),
    ('413ea5f8-2d09-52ef-8022-cbdd2f5d8771', '697838b9-47a5-576b-b1a4-351c0a63a06c', '4803964d793299a40ece442cadcd2ca3e4b6411c428acd8590efe6fd93dd4ee8', '4b266296b51351fd4468d6ff43091124068b3a7d888fd3c9d9a22dbb9b865be8', 'https://www.gutenberg.org/ebooks/14474'),
    ('9ebbdb49-4fd3-5c9b-bfd1-7cd30f57fcc8', '613d1470-50ac-53dd-8336-970d85984c93', '7675ae250ac9c81d962e46af0573281d6a282ef0120b0db945b33eef726b16c9', 'acbf47d7143d901cb5c33622d4707b906df5c35013b3990c2759d8cfbc52b12c', 'https://www.gutenberg.org/ebooks/41445'),
    ('69d368ad-18ae-51f8-9104-63a8bb344817', '3605d690-69c1-5d13-a4db-a4b5fd19d521', 'a8ea7fd9177aebd3b6534d9e67f78973e01686e073f156214e54884e1b6e328a', '3918bf0455a17df53bd889d7e993e7b0463126bbbe91e02a944bd681e4ce54f3', 'https://www.gutenberg.org/ebooks/11030'),
    ('8ceba576-e5ca-5b5d-918f-f1e9a0c96674', '945bc52a-8ff7-5ca9-90d5-8a5421dd3db8', '1907061a30e3bff28ac16e60462b5a51f61aad090a923c09318dc57f336ea124', '384003c0e7b28c89dbd126ca7444f60c02447ec3037c5dca8d73d60ca971f2e0', 'https://www.gutenberg.org/ebooks/25852'),
    ('01d63e58-5084-5fa8-8e5a-a959afeed945', 'e9d1a22f-4b6e-5380-95ab-b0e6187e4cbc', 'b1f5f93230c59aab23d58222ce662251cb540920fb7f240a66785c4443c355ec', '0460e6f12926f1c9b241300d19a471486a9252759d4ebde672504e7a222b1c78', 'https://www.gutenberg.org/ebooks/67828'),
    ('24c25efc-2c72-53f0-a44b-24830541c051', '98de50e0-1b47-53fd-aefc-7e206863896c', '234c15348a66919bad1d534cdd48ee8ddf91f50115a706cbefaa8edd049672fd', '7658032a8d295d4858582a406988a961922157bdda3bfcfdd340b5c536ee176f', 'https://www.gutenberg.org/ebooks/23'),
    ('ce36643f-a2fe-5032-9582-083581b9a0a9', 'aa58c08a-d832-5adf-9623-5a7b55c8b0d2', '041568f8dfef3ac6c2deb7699756f9d26d6aa8669647f4ce611b0ed4a95b0db6', '01331f52e804d3fa40477e37a4ea813b3e8bb94f0549b75d3158b67889a32fcf', 'https://www.gutenberg.org/ebooks/216')
ON CONFLICT (edition_id) DO NOTHING;

INSERT INTO edition_retirements (edition_id, reason)
VALUES
    ('da162526-0ca3-55b1-8c0d-1067af201722', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('7053ff47-d3fd-5972-84de-daa8b57eedee', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('f318d01c-8fb9-5aa8-9ed6-60a72b2432aa', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('3e5605e5-f215-5762-bd74-82a1d49e9d44', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('0d66f70e-69c0-5482-8a9b-1fe2c3d11e66', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('c05018bd-4099-5055-aa66-74e10a80e2f7', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('2c017832-2a4e-5575-81f0-41b9cbd92725', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('dbccbdb0-f3a4-5b05-b08d-98910240fc36', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('042f4bb2-6e83-5f6c-b927-bf2a6e8b81f6', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('23dbd08c-77cb-505d-a72f-3ce9f7daaa70', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('61530079-f533-548d-847b-80b6a5f97720', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('06a5e1eb-f237-599e-bb95-47116acffeb6', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('7a5910cf-2706-54f3-b0d5-4c8d8d316e30', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('96ef1d3d-b815-5b6d-bb6b-0754ffdd0335', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('50ad801b-11ac-571f-997a-b7c77d3cce14', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('1fdc5d65-50f5-53cb-af46-e4e94588548f', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('b1438c2f-d196-5eb2-ac4f-f57f79f45764', 'Excluded by conservative edition rights review, 2026-09-13'),
    ('326dd4f7-addf-5dc7-80cc-535ba250012f', 'Excluded by conservative edition rights review, 2026-09-13')
ON CONFLICT (edition_id) DO NOTHING;

-- Preserve any retirement made by the earlier metadata-only implementation.
INSERT INTO edition_retirements (edition_id, reason)
SELECT id, 'Previously retired by operator'
FROM editions WHERE metadata ->> 'retired' = 'true'
ON CONFLICT (edition_id) DO NOTHING;

-- Existing unreviewed content is hidden immediately when upgrading, including
-- any historic edition that is not one of the 18 known exclusion markers.
UPDATE passages p SET status = 'archived', published_at = NULL
WHERE (p.status <> 'archived' OR p.published_at IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM editions e JOIN corpus_publication_approvals a
      ON a.edition_id = e.id AND a.book_id = e.book_id
      AND a.source_sha256 = e.source_sha256
      AND a.normalized_sha256 = e.normalized_sha256
      AND a.source_url = e.source_url
    WHERE e.id = p.edition_id
      AND e.metadata ->> 'retired' IS DISTINCT FROM 'true'
      AND NOT EXISTS (SELECT 1 FROM edition_retirements r WHERE r.edition_id = e.id)
  );
UPDATE editions e
SET metadata = e.metadata || jsonb_build_object('retired', true, 'retiredAt', r.retired_at)
FROM edition_retirements r WHERE r.edition_id = e.id
  AND e.metadata ->> 'retired' IS DISTINCT FROM 'true';

CREATE OR REPLACE FUNCTION require_approved_publication() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'published' THEN
        -- Same lock used by import and retirement; serialize concurrent paths.
        PERFORM pg_advisory_xact_lock(hashtext(NEW.edition_id::text));
        IF NOT EXISTS (
            SELECT 1 FROM editions e JOIN corpus_publication_approvals a
              ON a.edition_id = e.id AND a.book_id = e.book_id
              AND a.source_sha256 = e.source_sha256
              AND a.normalized_sha256 = e.normalized_sha256
              AND a.source_url = e.source_url
            WHERE e.id = NEW.edition_id AND e.book_id = NEW.book_id
              AND e.metadata ->> 'retired' IS DISTINCT FROM 'true'
              AND NOT EXISTS (SELECT 1 FROM edition_retirements r WHERE r.edition_id = e.id)
        ) THEN
            RAISE EXCEPTION 'Edition is not approved for publication or has been retired';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS passages_require_rights_approval ON passages;
CREATE TRIGGER passages_require_rights_approval
    BEFORE INSERT OR UPDATE ON passages
    FOR EACH ROW EXECUTE FUNCTION require_approved_publication();

CREATE OR REPLACE FUNCTION preserve_edition_rights_decision() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.metadata ->> 'retired' = 'true'
       AND NEW.metadata ->> 'retired' IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'A retired edition cannot be revived';
    END IF;
    IF EXISTS (
        SELECT 1 FROM corpus_publication_approvals a WHERE a.edition_id = NEW.id
          AND (a.book_id <> NEW.book_id OR a.source_sha256 <> NEW.source_sha256
               OR a.normalized_sha256 IS DISTINCT FROM NEW.normalized_sha256
               OR a.source_url <> NEW.source_url)
    ) THEN
        RAISE EXCEPTION 'Approved edition identity and source hashes cannot change';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS editions_preserve_rights_decision ON editions;
CREATE TRIGGER editions_preserve_rights_decision
    BEFORE INSERT OR UPDATE ON editions
    FOR EACH ROW EXECUTE FUNCTION preserve_edition_rights_decision();

CREATE OR REPLACE FUNCTION reject_retirement_removal() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Edition retirements are permanent; use a newly reviewed edition';
END;
$$;
DROP TRIGGER IF EXISTS edition_retirements_immutable ON edition_retirements;
CREATE TRIGGER edition_retirements_immutable BEFORE UPDATE OR DELETE ON edition_retirements
    FOR EACH ROW EXECUTE FUNCTION reject_retirement_removal();
DROP TRIGGER IF EXISTS edition_retirements_no_truncate ON edition_retirements;
CREATE TRIGGER edition_retirements_no_truncate BEFORE TRUNCATE ON edition_retirements
    FOR EACH STATEMENT EXECUTE FUNCTION reject_retirement_removal();

-- The shared public view fails closed even if a stale program writes status
-- directly, or an old DB contains unreviewed editions with published passages.
CREATE OR REPLACE VIEW feed_passages AS
SELECT p.id, p.book_id, b.title, b.author, b.original_publication_year,
    p.exact_text, p.quality_score, p.themes, p.content_flags,
    c.title AS chapter_title, e.source_url, p.published_at
FROM passages p
JOIN books b ON b.id = p.book_id
JOIN editions e ON e.id = p.edition_id
JOIN corpus_publication_approvals a ON a.edition_id = e.id AND a.book_id = e.book_id
    AND a.source_sha256 = e.source_sha256 AND a.normalized_sha256 = e.normalized_sha256
    AND a.source_url = e.source_url
LEFT JOIN chapters c ON c.id = p.chapter_id
WHERE p.status = 'published' AND e.metadata ->> 'retired' IS DISTINCT FROM 'true'
    AND NOT EXISTS (SELECT 1 FROM edition_retirements r WHERE r.edition_id = e.id);

INSERT INTO schema_migrations(version) VALUES ('0011_corpus_rights_policy') ON CONFLICT DO NOTHING;
COMMIT;
