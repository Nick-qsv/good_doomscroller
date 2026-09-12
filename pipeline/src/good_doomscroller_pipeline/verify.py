"""Fail-closed reconstruction and provenance verification."""

from __future__ import annotations

from .ids import sha256_text
from .models import BookDocument, Candidate


class VerificationError(ValueError):
    """Raised when a candidate no longer matches its normalized source."""


def reconstruct_candidate(document: BookDocument, candidate: Candidate) -> str:
    chapter = next((item for item in document.chapters if item.id == candidate.chapter_id), None)
    if chapter is None:
        raise VerificationError(f"Unknown chapter ID: {candidate.chapter_id}")
    sentences = chapter.sentences
    by_id = {sentence.id: index for index, sentence in enumerate(sentences)}
    try:
        start_index = by_id[candidate.start_sentence_id]
        end_index = by_id[candidate.end_sentence_id]
    except KeyError as exc:
        raise VerificationError(f"Unknown sentence ID: {exc.args[0]}") from exc
    if end_index < start_index:
        raise VerificationError("Candidate sentence range is reversed.")
    start = sentences[start_index]
    end = sentences[end_index]
    if (
        start.ordinal != candidate.start_sentence_ordinal
        or end.ordinal != candidate.end_sentence_ordinal
        or start.start_offset != candidate.start_offset
        or end.end_offset != candidate.end_offset
    ):
        raise VerificationError("Candidate offsets or ordinals do not match source sentence IDs.")
    if not (0 <= start.start_offset < end.end_offset <= len(chapter.text)):
        raise VerificationError("Candidate offsets fall outside the normalized chapter.")
    return chapter.text[start.start_offset : end.end_offset]


def verify_candidate(document: BookDocument, candidate: Candidate) -> str:
    """Return reconstructed text only when every candidate claim is exact."""

    reconstructed = reconstruct_candidate(document, candidate)
    if reconstructed != candidate.text:
        raise VerificationError("Candidate text differs from its source-addressed text.")
    if sha256_text(reconstructed) != candidate.text_sha256:
        raise VerificationError("Candidate text hash does not match its reconstructed text.")
    return reconstructed
