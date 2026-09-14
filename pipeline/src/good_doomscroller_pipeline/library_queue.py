"""Prepare source-verified, unpublished review batches without network or model calls.

Run ``python -m good_doomscroller_pipeline.library_queue --help``. A review queue
is deliberately not a feed bundle and cannot be passed to the corpus importer.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import unicodedata
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import replace
from pathlib import Path
from typing import Any

from .candidates import CandidateConfig, generate_candidates
from .ids import sha256_bytes
from .models import BookDocument, Candidate, LoadedSource
from .normalize import normalize_source
from .selectors import HeuristicSelector, heuristic_features
from .verify import VerificationError, verify_candidate
from .verify_bundle import verify_feed_bundle

QUEUE_KIND = "unpublished-library-review-queue"
_WORDS = re.compile(r"[^\W_]+", re.UNICODE)


def _text_key(text: str) -> str:
    """Ignore case, typography and whitespace for deduplication, never for display."""

    return " ".join(_WORDS.findall(unicodedata.normalize("NFKC", text).casefold()))


def _document(feed: dict[str, Any]) -> BookDocument:
    verify_feed_bundle(feed)
    book = feed["book"]
    metadata = book["source"]
    source = LoadedSource(
        data=base64.b64decode(feed["verificationBundle"]["originalSourceBase64"], validate=True),
        name=metadata["fileName"],
        kind=metadata["kind"],
        sha256=metadata["sha256"],
        source_url=metadata["url"],
        download_url=metadata["downloadUrl"],
        retrieved_at=metadata["retrievedAt"],
        media_type=metadata["mediaType"],
    )
    return normalize_source(
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


def _overlaps(candidate: Candidate, ranges: list[tuple[int, int]]) -> bool:
    return any(
        candidate.start_offset < end and start < candidate.end_offset for start, end in ranges
    )


def _capacity(candidates: tuple[Candidate, ...]) -> int:
    """Count one feasible, non-overlapping set; this is not an editorial approval."""

    ends: dict[str, int] = defaultdict(int)
    total = 0
    for candidate in sorted(candidates, key=lambda item: (item.chapter_id, item.end_offset)):
        if candidate.start_offset >= ends[candidate.chapter_id]:
            total += 1
            ends[candidate.chapter_id] = candidate.end_offset
    return total


def prepare_queue(
    feeds: Sequence[dict[str, Any]],
    *,
    per_book: int = 20,
    config: CandidateConfig | None = None,
    min_score: float = 80,
    previous_queues: Sequence[dict[str, Any]] = (),
) -> dict[str, Any]:
    """Select new exact spans from sections already represented in reviewed feeds.

    All prior queue rows are excluded, whether pending, rejected or accepted.
    Review status is intentionally never interpreted as publication permission.
    """

    if not 1 <= per_book <= 500:
        raise ValueError("per_book must be between 1 and 500")
    if not 0 <= min_score <= 100:
        raise ValueError("min_score must be between 0 and 100")
    config = config or CandidateConfig(min_words=18, max_words=65, max_sentences=3)
    documents = {_feed["book"]["editionId"]: _document(_feed) for _feed in feeds}
    if not feeds or len(documents) != len(feeds):
        raise ValueError("Provide at least one bundle and only one bundle per edition")

    ranges: dict[tuple[str, str], list[tuple[int, int]]] = defaultdict(list)
    text_keys: set[str] = set()
    for feed in feeds:
        for passage in feed["passages"]:
            provenance = passage["provenance"]
            ranges[(passage["editionId"], passage["chapter"]["id"])].append(
                (provenance["startOffset"], provenance["endOffset"])
            )
            text_keys.add(_text_key(passage["text"]))
    published_unique_count = len(text_keys)
    previous_count = 0
    for queue in previous_queues:
        if queue.get("kind") != QUEUE_KIND or queue.get("version") != "1":
            raise ValueError("Unsupported previous review queue")
        for entry in queue["candidates"]:
            edition_id = entry["editionId"]
            if edition_id not in documents:
                raise ValueError(
                    "Previous queue references an edition absent from the input bundles"
                )
            document = documents[edition_id]
            candidate = Candidate(**entry["candidate"])
            verify_candidate(document, candidate)
            if entry["sourceSha256"] != document.source.sha256:
                raise VerificationError("Previous queue source differs from the preserved edition")
            ranges[(edition_id, candidate.chapter_id)].append(
                (candidate.start_offset, candidate.end_offset)
            )
            text_keys.add(_text_key(candidate.text))
            previous_count += 1

    book_rows: list[dict[str, Any]] = []
    entries: list[dict[str, Any]] = []
    pool_keys = set(text_keys)
    for feed in sorted(feeds, key=lambda item: item["book"]["slug"]):
        book = feed["book"]
        document = documents[book["editionId"]]
        # This avoids unreviewed front/end sections. Merged source sections can
        # still contain editorial matter, so each resulting span needs review.
        represented = {passage["chapter"]["id"] for passage in feed["passages"]}
        scoped = replace(
            document,
            chapters=tuple(chapter for chapter in document.chapters if chapter.id in represented),
        )
        generated = generate_candidates(scoped, config)
        eligible: list[Candidate] = []
        for candidate in generated:
            key = _text_key(candidate.text)
            if key in pool_keys or _overlaps(
                candidate, ranges[(document.edition_id, candidate.chapter_id)]
            ):
                continue
            if heuristic_features(candidate)[0] < min_score:
                continue
            pool_keys.add(key)
            eligible.append(candidate)
        selections = HeuristicSelector().select(tuple(eligible), max_passages=per_book)
        candidate_map = {candidate.id: candidate for candidate in eligible}
        chapter_map = {chapter.id: chapter for chapter in document.chapters}
        for selection in selections:
            candidate = candidate_map[selection.candidate_id]
            verify_candidate(document, candidate)
            chapter = chapter_map[candidate.chapter_id]
            text_keys.add(_text_key(candidate.text))
            entries.append(
                {
                    "reviewStatus": "required",
                    "reviewNotes": "",
                    "editionId": document.edition_id,
                    "bookId": document.id,
                    "title": document.title,
                    "authors": list(document.authors),
                    "sourceSha256": document.source.sha256,
                    "normalizedSha256": document.normalized_sha256,
                    "chapterSha256": chapter.content_sha256,
                    "chapterTitle": chapter.title,
                    "chapterLocator": chapter.locator,
                    "candidate": {
                        "id": candidate.id,
                        "chapter_id": candidate.chapter_id,
                        "start_sentence_id": candidate.start_sentence_id,
                        "end_sentence_id": candidate.end_sentence_id,
                        "start_sentence_ordinal": candidate.start_sentence_ordinal,
                        "end_sentence_ordinal": candidate.end_sentence_ordinal,
                        "start_offset": candidate.start_offset,
                        "end_offset": candidate.end_offset,
                        "text": candidate.text,
                        "text_sha256": candidate.text_sha256,
                        "word_count": candidate.word_count,
                    },
                    "contextBefore": chapter.text[
                        max(0, candidate.start_offset - 600) : candidate.start_offset
                    ],
                    "contextAfter": chapter.text[candidate.end_offset : candidate.end_offset + 600],
                    "suggestedScore": selection.score,
                    "suggestedThemes": list(selection.themes),
                    "suggestedContentFlags": list(selection.content_flags),
                }
            )
        book_rows.append(
            {
                "book": book,
                "publishedPassages": len(feed["passages"]),
                "representedSourceSections": len(scoped.chapters),
                "generatedCandidateWindows": len(generated),
                "eligibleCandidateWindows": len(eligible),
                "nonOverlappingCandidateCapacity": _capacity(tuple(eligible)),
                "queuedCandidates": len(selections),
            }
        )
    return {
        "kind": QUEUE_KIND,
        "version": "1",
        "status": "review-required",
        "offsetUnit": "unicode-code-points",
        "selectionPolicy": {
            "perBook": per_book,
            "minWords": config.min_words,
            "maxWords": config.max_words,
            "maxSentences": config.max_sentences,
            "minHeuristicScore": min_score,
            "sourceSections": "only sections represented in supplied reviewed bundles",
        },
        "summary": {
            "books": len(feeds),
            "publishedPassages": sum(len(feed["passages"]) for feed in feeds),
            "uniquePublishedTexts": published_unique_count,
            "previousQueueEntriesExcluded": previous_count,
            "eligibleCandidateWindows": sum(row["eligibleCandidateWindows"] for row in book_rows),
            "nonOverlappingCandidateCapacity": sum(
                row["nonOverlappingCandidateCapacity"] for row in book_rows
            ),
            "queuedCandidates": len(entries),
        },
        "reviewChecklist": [
            "Check the full surrounding source and edition notes, not just these context excerpts.",
            "Confirm complete thought, speaker, attribution and mobile readability.",
            "Reject editorial notes, source notices, OCR errors and misleading cropped context.",
            "Review sensitive content and near duplicates not caught by exact-text or span checks.",
            "Confirm the preserved rights record applies to the intended deployment jurisdiction.",
            "Keep AI interpretation separate from exact quotation text and provenance.",
            "Export only accepted spans into a verified feed after editorial review.",
        ],
        "books": book_rows,
        "candidates": entries,
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--published-dir", type=Path, default=Path("corpus/published"))
    parser.add_argument("--output", type=Path, required=True, help="new unpublished queue JSON")
    parser.add_argument("--exclude-queue", action="append", type=Path, default=[])
    parser.add_argument("--per-book", type=int, default=20)
    parser.add_argument("--min-score", type=float, default=80)
    args = parser.parse_args(argv)
    try:
        if args.output.resolve().is_relative_to(args.published_dir.resolve()):
            raise ValueError("Review queues must be written outside the published corpus directory")
        paths = sorted(args.published_dir.glob("*.json"))
        raw_feeds = [(path, path.read_bytes()) for path in paths]
        queue = prepare_queue(
            [json.loads(data) for _, data in raw_feeds],
            per_book=args.per_book,
            min_score=args.min_score,
            previous_queues=[json.loads(path.read_text("utf-8")) for path in args.exclude_queue],
        )
        queue["inputBundles"] = [
            {"path": str(path), "sha256": sha256_bytes(data)} for path, data in raw_feeds
        ]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        # Exclusive creation protects review work from accidental reruns.
        with args.output.open("x", encoding="utf-8") as destination:
            json.dump(queue, destination, ensure_ascii=False, indent=2)
            destination.write("\n")
        print(json.dumps(queue["summary"], indent=2))
        print(f"Unpublished review queue written to {args.output}")
        return 0
    except (OSError, ValueError, KeyError, TypeError, RuntimeError) as exc:
        parser.error(str(exc))
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
