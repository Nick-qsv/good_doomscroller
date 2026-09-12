"""Export verified candidates into the web application's stable JSON contract."""

from __future__ import annotations

import base64
from typing import Any

from .ids import sha256_bytes, stable_uuid
from .models import BookDocument, Candidate, LoadedSource, PassageSelection
from .verify import VerificationError, verify_candidate

SCHEMA_VERSION = "1.0"
PIPELINE_VERSION = "0.2.0"


def normalized_document_to_dict(document: BookDocument) -> dict[str, Any]:
    """Serialize the normalized source for audits and pipeline debugging."""

    return {
        "schemaVersion": SCHEMA_VERSION,
        "book": {
            "id": document.id,
            "editionId": document.edition_id,
            "slug": document.slug,
            "title": document.title,
            "authors": list(document.authors),
            "language": document.language,
            "source": {
                "name": document.source.provider,
                "fileName": document.source.file_name,
                "kind": document.source.kind,
                "mediaType": document.source.media_type,
                "url": document.source.url,
                "downloadUrl": document.source.download_url,
                "version": document.source.version,
                "retrievedAt": document.source.retrieved_at,
                "sha256": document.source.sha256,
                "normalizedSha256": document.normalized_sha256,
                "rights": {
                    "status": document.source.rights_status,
                    "jurisdiction": document.source.rights_jurisdiction,
                    "basis": document.source.rights_basis,
                },
            },
        },
        "chapters": [
            {
                "id": chapter.id,
                "ordinal": chapter.ordinal,
                "title": chapter.title,
                "locator": chapter.locator,
                "text": chapter.text,
                "contentSha256": chapter.content_sha256,
                "paragraphs": [
                    {
                        "id": paragraph.id,
                        "ordinal": paragraph.ordinal,
                        "text": paragraph.text,
                        "startOffset": paragraph.start_offset,
                        "endOffset": paragraph.end_offset,
                        "contentSha256": paragraph.content_sha256,
                        "sentences": [
                            {
                                "id": sentence.id,
                                "ordinal": sentence.ordinal,
                                "paragraphId": sentence.paragraph_id,
                                "paragraphOrdinal": sentence.paragraph_ordinal,
                                "text": sentence.text,
                                "startOffset": sentence.start_offset,
                                "endOffset": sentence.end_offset,
                                "contentSha256": sentence.content_sha256,
                            }
                            for sentence in paragraph.sentences
                        ],
                    }
                    for paragraph in chapter.paragraphs
                ],
            }
            for chapter in document.chapters
        ],
    }


def export_feed(
    document: BookDocument,
    candidates: tuple[Candidate, ...],
    selections: tuple[PassageSelection, ...],
    *,
    source: LoadedSource | None = None,
) -> dict[str, Any]:
    """Build deterministic web-ready JSON, reconstructing every quote from source IDs."""

    if not document.authors:
        raise VerificationError(
            "Book author metadata is required for export; process the source with --author."
        )
    candidate_map = {candidate.id: candidate for candidate in candidates}
    chapter_map = {chapter.id: chapter for chapter in document.chapters}
    seen: set[str] = set()
    passages: list[dict[str, Any]] = []
    for rank, selection in enumerate(selections, 1):
        if selection.candidate_id in seen:
            raise VerificationError(f"Candidate selected more than once: {selection.candidate_id}")
        seen.add(selection.candidate_id)
        try:
            candidate = candidate_map[selection.candidate_id]
        except KeyError as exc:
            raise VerificationError(
                f"Selection references unknown candidate: {selection.candidate_id}"
            ) from exc
        chapter = chapter_map[candidate.chapter_id]
        quote = verify_candidate(document, candidate)
        passages.append(
            {
                "id": stable_uuid("passage", document.edition_id, candidate.id),
                "bookId": document.id,
                "editionId": document.edition_id,
                "text": quote,
                "title": document.title,
                "authors": list(document.authors),
                "wordCount": candidate.word_count,
                "status": "candidate",
                "qualityScore": round(selection.score / 100.0, 6),
                "chapter": {
                    "id": chapter.id,
                    "ordinal": chapter.ordinal,
                    "title": chapter.title,
                    "locator": chapter.locator,
                },
                "provenance": {
                    "sourceSha256": document.source.sha256,
                    "chapterSha256": chapter.content_sha256,
                    "startSentenceId": candidate.start_sentence_id,
                    "endSentenceId": candidate.end_sentence_id,
                    "startSentenceOrdinal": candidate.start_sentence_ordinal,
                    "endSentenceOrdinal": candidate.end_sentence_ordinal,
                    "startOffset": candidate.start_offset,
                    "endOffset": candidate.end_offset,
                    "quoteSha256": candidate.text_sha256,
                },
                "curation": {
                    "selector": selection.selector,
                    "model": selection.model,
                    "score": selection.score,
                    "rank": rank,
                    "reason": selection.reason,
                    "themes": list(selection.themes),
                    "contentFlags": list(selection.content_flags),
                },
            }
        )

    result = {
        "schemaVersion": SCHEMA_VERSION,
        "pipelineVersion": PIPELINE_VERSION,
        "book": {
            "id": document.id,
            "editionId": document.edition_id,
            "slug": document.slug,
            "title": document.title,
            "authors": list(document.authors),
            "language": document.language,
            "source": {
                "name": document.source.provider,
                "fileName": document.source.file_name,
                "kind": document.source.kind,
                "mediaType": document.source.media_type,
                "url": document.source.url,
                "downloadUrl": document.source.download_url,
                "version": document.source.version,
                "retrievedAt": document.source.retrieved_at,
                "sha256": document.source.sha256,
                "normalizedSha256": document.normalized_sha256,
                "rights": {
                    "status": document.source.rights_status,
                    "jurisdiction": document.source.rights_jurisdiction,
                    "basis": document.source.rights_basis,
                },
            },
        },
        "passages": passages,
    }
    if source is not None:
        if source.sha256 != document.source.sha256 or sha256_bytes(source.data) != source.sha256:
            raise VerificationError("Original source does not match the normalized edition.")
        result["verificationBundle"] = {
            "version": "1",
            "normalizationVersion": "1",
            "offsetUnit": "unicode-code-points",
            "originalSourceBase64": base64.b64encode(source.data).decode("ascii"),
            "chapters": normalized_document_to_dict(document)["chapters"],
        }
    return result
