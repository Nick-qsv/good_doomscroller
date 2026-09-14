"""Check a selection comparison's quoted evidence, never its editorial judgment."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from .models import BookDocument
from .verify import VerificationError

_TIMESTAMP = re.compile(
    r"\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T"
    r"([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?"
    r"(Z|[+-]([01]\d|2[0-3]):[0-5]\d)"
)


def verify_recording_time(timestamp: Any) -> None:
    """Check a supplied clock value's format without authenticating that time."""
    if not isinstance(timestamp, str) or not _TIMESTAMP.fullmatch(timestamp):
        raise VerificationError("Recording time requires an ISO timestamp with a timezone.")
    try:
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise VerificationError("Recording time must be a valid calendar date and time.") from exc


def verify_decision_review(
    review: Any, document: BookDocument, *, selected_chapter_id: str,
    selected_start: int, selected_end: int,
) -> None:
    """Reproduce the optional comparison slice from the same preserved edition."""
    try:
        expected = {
            "reviewedAt", "reviewKind", "summary", "alternative", "whySelected",
            "whyAlternativeNotSelected", "limitation",
        }
        if not isinstance(review, dict) or set(review) != expected:
            raise VerificationError("Malformed decision review.")
        if review["reviewKind"] not in {"selection-comparison", "retrospective-comparison"}:
            raise VerificationError("Decision review has an unsupported comparison kind.")
        verify_recording_time(review["reviewedAt"])
        for field in ("summary", "whySelected", "whyAlternativeNotSelected", "limitation"):
            value = review[field]
            if not isinstance(value, str) or not 1 <= len(value) <= 3_000 or value != value.strip():
                raise VerificationError("Malformed decision review narrative.")
        alternative = review["alternative"]
        if not isinstance(alternative, dict) or set(alternative) != {
            "chapterId", "startOffset", "endOffset", "text",
        }:
            raise VerificationError("Malformed decision-review alternative.")
        chapter = next(item for item in document.chapters if item.id == alternative["chapterId"])
        start, end, text = (
            alternative["startOffset"], alternative["endOffset"], alternative["text"],
        )
        if (
            type(start) is not int or type(end) is not int
            or not 0 <= start < end <= len(chapter.text)
            or not isinstance(text, str) or not 1 <= len(text) <= 10_000
            or chapter.text[start:end] != text
        ):
            raise VerificationError("Decision-review alternative differs from its source slice.")
        if (chapter.id, start, end) == (selected_chapter_id, selected_start, selected_end):
            raise VerificationError(
                "Decision-review alternative must use a different source range."
            )
    except VerificationError:
        raise
    except (KeyError, TypeError, ValueError, StopIteration) as exc:
        raise VerificationError("Malformed or incomplete decision review.") from exc
