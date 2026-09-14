from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from good_doomscroller_pipeline.candidates import CandidateConfig, generate_candidates
from good_doomscroller_pipeline.export import export_feed
from good_doomscroller_pipeline.library_queue import main, prepare_queue
from good_doomscroller_pipeline.models import PassageSelection
from good_doomscroller_pipeline.normalize import normalize_source
from good_doomscroller_pipeline.source import load_source
from good_doomscroller_pipeline.verify import VerificationError

CONFIG = CandidateConfig(min_words=5, max_words=30, max_sentences=2)


@pytest.fixture()
def reviewed_feed(tmp_path: Path) -> dict:
    path = tmp_path / "source.txt"
    path.write_text(
        "CHAPTER I\n\n"
        "Wisdom grows when a careful reader questions the source of every claim. "
        "A patient heart finds beauty even in the quiet hours before dawn. "
        "Knowledge brings freedom when the truth is shared with every willing learner. "
        "Nature teaches that the strongest tree still bends before the wind. "
        "The future belongs to those who learn from the wisdom of the past. "
        "Love lives in the small kindnesses that transform a stranger into a friend.\n\n"
        "CHAPTER II\n\n"
        "This unreviewed source section must not enter the proposed selection pool.\n",
        encoding="utf-8",
    )
    source = load_source(path)
    document = normalize_source(source, title="Test book", authors=("Test author",))
    candidates = generate_candidates(document, CONFIG)
    first = candidates[0]
    return export_feed(
        document, candidates,
        (PassageSelection(first.id, "heuristic", 90, "Reviewed test selection"),),
        source=source,
    )


def test_queue_excludes_published_overlaps_and_unreviewed_sections(reviewed_feed: dict) -> None:
    queue = prepare_queue([reviewed_feed], config=CONFIG, min_score=0)
    assert queue["status"] == "review-required"
    assert "passages" not in queue
    assert queue["summary"]["publishedPassages"] == 1
    assert queue["candidates"]
    published = reviewed_feed["passages"][0]
    chapters = {c["id"]: c for c in reviewed_feed["verificationBundle"]["chapters"]}
    ends: dict[str, int] = {}
    for entry in sorted(queue["candidates"], key=lambda row: row["candidate"]["start_offset"]):
        candidate = entry["candidate"]
        assert entry["reviewStatus"] == "required"
        assert candidate["chapter_id"] == published["chapter"]["id"]
        assert candidate["start_offset"] >= published["provenance"]["endOffset"]
        assert candidate["start_offset"] >= ends.get(candidate["chapter_id"], 0)
        ends[candidate["chapter_id"]] = candidate["end_offset"]
        chapter = chapters[candidate["chapter_id"]]
        assert candidate["text"] == chapter["text"][
            candidate["start_offset"] : candidate["end_offset"]
        ]
        assert entry["sourceSha256"] == reviewed_feed["book"]["source"]["sha256"]
    assert queue["books"][0]["book"]["source"]["rights"] == (
        reviewed_feed["book"]["source"]["rights"]
    )


def test_previous_batch_is_excluded_without_trusting_review_status(reviewed_feed: dict) -> None:
    first = prepare_queue([reviewed_feed], config=CONFIG, min_score=0, per_book=1)
    first["candidates"][0]["reviewStatus"] = "rejected"
    second = prepare_queue(
        [reviewed_feed], config=CONFIG, min_score=0, previous_queues=[first]
    )
    old = first["candidates"][0]["candidate"]
    assert second["candidates"]
    for entry in second["candidates"]:
        new = entry["candidate"]
        assert new["end_offset"] <= old["start_offset"] or old["end_offset"] <= new["start_offset"]
    assert second["summary"]["previousQueueEntriesExcluded"] == 1


def test_changed_source_or_queue_quote_fails_closed(reviewed_feed: dict) -> None:
    first = prepare_queue([reviewed_feed], config=CONFIG, min_score=0, per_book=1)
    first["candidates"][0]["candidate"]["text"] += " Fabrication."
    with pytest.raises(VerificationError):
        prepare_queue([reviewed_feed], config=CONFIG, min_score=0, previous_queues=[first])
    reviewed_feed["passages"][0]["text"] += " Fabrication."
    with pytest.raises(VerificationError):
        prepare_queue([reviewed_feed], config=CONFIG, min_score=0)


def test_duplicate_editions_do_not_multiply_the_available_texts(
    reviewed_feed: dict, tmp_path: Path
) -> None:
    source_path = tmp_path / "alternate.txt"
    source_path.write_bytes(
        base64.b64decode(reviewed_feed["verificationBundle"]["originalSourceBase64"]) + b"\n"
    )
    source = load_source(source_path)
    document = normalize_source(source, title="Alternate edition", authors=("Test author",))
    candidates = generate_candidates(document, CONFIG)
    alternate = export_feed(
        document, candidates,
        (PassageSelection(candidates[0].id, "heuristic", 90, "Reviewed test selection"),),
        source=source,
    )
    queue = prepare_queue([reviewed_feed, alternate], config=CONFIG, min_score=0)
    single = prepare_queue([reviewed_feed], config=CONFIG, min_score=0)
    assert queue["summary"]["publishedPassages"] == 2
    assert queue["summary"]["uniquePublishedTexts"] == 1
    assert queue["summary"]["eligibleCandidateWindows"] == (
        single["summary"]["eligibleCandidateWindows"]
    )
    assert queue["summary"]["nonOverlappingCandidateCapacity"] == (
        single["summary"]["nonOverlappingCandidateCapacity"]
    )
    assert queue["summary"]["queuedCandidates"] == single["summary"]["queuedCandidates"]
    assert queue == prepare_queue([alternate, reviewed_feed], config=CONFIG, min_score=0)


def test_cli_protects_published_directory_and_existing_queue(
    reviewed_feed: dict, tmp_path: Path
) -> None:
    published_dir = tmp_path / "published"
    published_dir.mkdir()
    (published_dir / "book.json").write_text(json.dumps(reviewed_feed), encoding="utf-8")
    base = ["--published-dir", str(published_dir)]
    with pytest.raises(SystemExit) as error:
        main([*base, "--output", str(published_dir / "queue.json")])
    assert error.value.code == 2
    output = tmp_path / "batch.json"
    assert main([*base, "--output", str(output)]) == 0
    before = output.read_bytes()
    with pytest.raises(SystemExit) as error:
        main([*base, "--output", str(output)])
    assert error.value.code == 2
    assert output.read_bytes() == before
