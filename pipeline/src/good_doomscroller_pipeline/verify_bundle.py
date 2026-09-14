"""Reproduce normalization from archived bytes; never trust submitted quote hashes alone."""

from __future__ import annotations

import base64
import binascii
import hashlib
from typing import Any

from .decision_review import verify_decision_review, verify_recording_time
from .export import normalized_document_to_dict
from .models import Candidate, LoadedSource
from .normalize import normalize_source
from .verify import VerificationError, verify_candidate


def verify_feed_bundle(feed: dict[str, Any]) -> None:
    try:
        bundle = feed["verificationBundle"]
        if (
            bundle["version"] != "1"
            or bundle["normalizationVersion"] != "1"
            or bundle["offsetUnit"] != "unicode-code-points"
        ):
            raise VerificationError("Unsupported verification or normalization version.")
        book = feed["book"]
        metadata = book["source"]
        data = base64.b64decode(bundle["originalSourceBase64"], validate=True)
        digest = hashlib.sha256(data).hexdigest()
        if digest != metadata["sha256"]:
            raise VerificationError("Original source bytes do not match their SHA-256 digest.")
        source = LoadedSource(
            data=data,
            name=metadata["fileName"],
            kind=metadata["kind"],
            sha256=digest,
            source_url=metadata["url"],
            download_url=metadata["downloadUrl"],
            retrieved_at=metadata["retrievedAt"],
            media_type=metadata["mediaType"],
        )
        document = normalize_source(
            source,
            title=book["title"],
            authors=tuple(book["authors"]),
            language=book["language"],
            slug=book["slug"],
            source_provider=metadata["name"],
            source_version=metadata["version"],
            rights_status=metadata["rights"]["status"],
            rights_jurisdiction=metadata["rights"]["jurisdiction"],
            rights_basis=metadata["rights"]["basis"],
        )
        if document.id != book["id"] or document.edition_id != book["editionId"]:
            raise VerificationError("Book or edition identity does not match archived source.")
        if document.normalized_sha256 != metadata["normalizedSha256"]:
            raise VerificationError("Normalized source digest differs from reproduced source.")
        if normalized_document_to_dict(document)["chapters"] != bundle["chapters"]:
            raise VerificationError("Normalized chapters differ from reproduced original source.")
        chapters = {chapter.id: chapter for chapter in document.chapters}
        for passage in feed["passages"]:
            if (
                passage["bookId"] != document.id
                or passage["editionId"] != document.edition_id
                or passage["title"] != document.title
                or passage["authors"] != list(document.authors)
            ):
                raise VerificationError("Passage attribution differs from its preserved edition.")
            provenance = passage["provenance"]
            chapter = chapters[passage["chapter"]["id"]]
            if (
                provenance["sourceSha256"] != digest
                or provenance["chapterSha256"] != chapter.content_sha256
                or passage["chapter"]["ordinal"] != chapter.ordinal
                or passage["chapter"]["title"] != chapter.title
                or passage["chapter"]["locator"] != chapter.locator
            ):
                raise VerificationError("Passage chapter metadata differs from original source.")
            verify_candidate(
                document,
                Candidate(
                    id=passage["id"],
                    chapter_id=chapter.id,
                    start_sentence_id=provenance["startSentenceId"],
                    end_sentence_id=provenance["endSentenceId"],
                    start_sentence_ordinal=provenance["startSentenceOrdinal"],
                    end_sentence_ordinal=provenance["endSentenceOrdinal"],
                    start_offset=provenance["startOffset"],
                    end_offset=provenance["endOffset"],
                    text=passage["text"],
                    text_sha256=provenance["quoteSha256"],
                    word_count=passage["wordCount"],
                ),
            )
            if "decisionReview" in passage.get("curation", {}):
                verify_decision_review(
                    passage["curation"]["decisionReview"], document,
                    selected_chapter_id=chapter.id,
                    selected_start=provenance["startOffset"],
                    selected_end=provenance["endOffset"],
                )
            if "selectionRecordedAt" in passage.get("curation", {}):
                verify_recording_time(passage["curation"]["selectionRecordedAt"])
    except (KeyError, TypeError, binascii.Error) as exc:
        raise VerificationError("Malformed or incomplete verification bundle.") from exc
