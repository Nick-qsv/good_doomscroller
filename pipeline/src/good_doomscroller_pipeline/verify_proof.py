"""Offline checks for downloaded public proof and original-source files."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .decision_review import verify_decision_review, verify_recording_time
from .export import normalized_document_to_dict
from .ids import sha256_text
from .models import Candidate, LoadedSource
from .normalize import normalize_source
from .verify import VerificationError, verify_candidate


def verify_receipt_proof(proof: dict[str, Any], original: bytes) -> None:
    """Reproduce content and hash checks without trusting the application's success label.

    A self-consistent proof does not authenticate a publisher, operator or timestamp.
    """
    try:
        receipt_json = proof["receiptJson"]
        receipt = json.loads(receipt_json)
        if receipt != proof["receipt"] or sha256_text(receipt_json) != proof["receiptSha256"]:
            raise VerificationError("Receipt JSON does not match its recorded fingerprint.")
        if (
            proof["schemaVersion"] != "1.0"
            or receipt["schemaVersion"] != "1.0"
            or receipt["action"] != "published"
            or receipt["verification"]["method"]
            != "reproduced-normalization-and-exact-source-slice"
            or receipt["verification"]["normalizationVersion"] != "1"
        ):
            raise VerificationError("Unsupported publication receipt format.")
        previous = None
        for item in proof["history"]:
            saved = json.loads(item["receiptJson"])
            if (
                sha256_text(item["receiptJson"]) != item["receiptSha256"]
                or saved["previousReceiptSha256"] != previous
                or saved["passageId"] != receipt["passageId"]
            ):
                raise VerificationError("Receipt history is incomplete or has changed.")
            previous = item["receiptSha256"]
        if previous != proof["receiptSha256"]:
            raise VerificationError("Receipt is not the final entry in its supplied history.")

        source_digest = hashlib.sha256(original).hexdigest()
        metadata = receipt["source"]
        if source_digest != metadata["sha256"]:
            raise VerificationError("Original source file does not match its fingerprint.")
        settings = proof["normalizationInput"]
        if settings["kind"] not in {"epub", "xhtml", "text"}:
            raise VerificationError("Unsupported preserved source format.")
        source = LoadedSource(
            data=original,
            name=settings["fileName"],
            kind=settings["kind"],
            sha256=source_digest,
            source_url=metadata["url"],
            download_url=metadata["downloadUrl"],
            retrieved_at=metadata["retrievedAt"],
            media_type=settings["mediaType"],
        )
        document = normalize_source(
            source, title=receipt["book"]["title"], authors=tuple(receipt["book"]["authors"]),
            language=settings["language"], source_provider=metadata["name"],
            source_version=metadata["version"],
        )
        normalized = proof["normalizedSource"]
        if (
            normalized["normalizationVersion"] != "1"
            or normalized["offsetUnit"] != "unicode-code-points"
            or normalized["chapterSeparator"] != "\n\n\n"
            or document.id != receipt["book"]["id"]
            or document.edition_id != receipt["book"]["editionId"]
            or document.normalized_sha256 != metadata["normalizedSha256"]
            or normalized_document_to_dict(document)["chapters"] != normalized["chapters"]
        ):
            raise VerificationError("Normalized source differs from the original file.")

        chapter = next(item for item in document.chapters if item.id == receipt["chapter"]["id"])
        if (
            chapter.content_sha256 != receipt["chapter"]["sha256"]
            or chapter.ordinal != receipt["chapter"]["ordinal"]
            or chapter.title != receipt["chapter"]["title"]
            or chapter.locator != receipt["chapter"]["locator"]
        ):
            raise VerificationError("Chapter metadata differs from the original source.")
        quote = receipt["quote"]
        if quote["offsetUnit"] != "unicode-code-points":
            raise VerificationError("Unsupported quote offset unit.")
        sentences = {sentence.id: sentence for sentence in chapter.sentences}
        start = sentences[quote["startSentenceId"]]
        end = sentences[quote["endSentenceId"]]
        verify_candidate(document, Candidate(
            id=receipt["passageId"], chapter_id=chapter.id,
            start_sentence_id=start.id, end_sentence_id=end.id,
            start_sentence_ordinal=start.ordinal, end_sentence_ordinal=end.ordinal,
            start_offset=quote["startOffset"], end_offset=quote["endOffset"],
            text=quote["text"], text_sha256=quote["sha256"], word_count=len(quote["text"].split()),
        ))
        if "decisionReview" in receipt.get("selection", {}):
            verify_decision_review(
                receipt["selection"]["decisionReview"], document,
                selected_chapter_id=chapter.id,
                selected_start=quote["startOffset"], selected_end=quote["endOffset"],
            )
        if "selectionRecordedAt" in receipt.get("selection", {}):
            verify_recording_time(receipt["selection"]["selectionRecordedAt"])
    except (KeyError, TypeError, StopIteration) as exc:
        raise VerificationError("Malformed or incomplete public proof.") from exc
