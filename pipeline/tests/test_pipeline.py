# ruff: noqa: E501
from __future__ import annotations

import base64
import json
import zipfile
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID

import pytest
from jsonschema import Draft202012Validator, FormatChecker

from good_doomscroller_pipeline.candidates import CandidateConfig, generate_candidates
from good_doomscroller_pipeline.cli import main
from good_doomscroller_pipeline.export import export_feed
from good_doomscroller_pipeline.models import Candidate
from good_doomscroller_pipeline.normalize import NormalizationError, normalize_source
from good_doomscroller_pipeline.openai_selector import OpenAISelector
from good_doomscroller_pipeline.selectors import HeuristicSelector
from good_doomscroller_pipeline.source import SourceError, load_source
from good_doomscroller_pipeline.verify import VerificationError, verify_candidate
from good_doomscroller_pipeline.verify_bundle import verify_feed_bundle
from good_doomscroller_pipeline.verify_proof import verify_receipt_proof

CHAPTER_ONE = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Chapter I</title></head>
  <body epub:type="bodymatter z3998:fiction">
    <section epub:type="chapter">
      <h2>Chapter I</h2>
      <p>The morning opened with a clear and golden light across the quiet harbor. Every mast stood dark against the sky, while the tide whispered of journeys not yet begun.</p>
      <p>Clara held the old map in both hands. She knew that courage was not the absence of fear, but the decision that some bright purpose mattered more.</p>
      <aside><p>This editor's note must never enter the normalized source.</p></aside>
    </section>
  </body>
</html>
"""

CHAPTER_TWO = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Chapter II</title></head>
  <body epub:type="bodymatter z3998:fiction">
    <section epub:type="chapter">
      <h2>Chapter II</h2>
      <p>At noon the town bells answered one another from hill to hill. Their music seemed to gather every private hope and return it enlarged to the listening streets.</p>
      <p>What is freedom, she wondered, if not the power to choose a worthy road? The question followed her beyond the final house and into the green country.</p>
    </section>
  </body>
</html>
"""


@pytest.fixture()
def minimal_epub(tmp_path: Path) -> Path:
    path = tmp_path / "test-book.epub"
    container = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""
    package = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:test-book</dc:identifier>
    <dc:title>The Test Voyage</dc:title>
    <dc:creator>Ada Example</dc:creator>
    <dc:language>en-US</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="titlepage" href="text/titlepage.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-1" href="text/chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-2" href="text/chapter-2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="titlepage"/>
    <itemref idref="chapter-1"/>
    <itemref idref="chapter-2"/>
  </spine>
</package>
"""
    titlepage = (
        """<html xmlns="http://www.w3.org/1999/xhtml"><body><p>The Test Voyage</p></body></html>"""
    )
    nav = """<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><p>Contents</p></nav></body></html>"""
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        archive.writestr("META-INF/container.xml", container)
        archive.writestr("EPUB/content.opf", package)
        archive.writestr("EPUB/nav.xhtml", nav)
        archive.writestr("EPUB/text/titlepage.xhtml", titlepage)
        archive.writestr("EPUB/text/chapter-1.xhtml", CHAPTER_ONE)
        archive.writestr("EPUB/text/chapter-2.xhtml", CHAPTER_TWO)
    return path


def test_generated_epub_normalizes_with_stable_ids(minimal_epub: Path) -> None:
    source = load_source(minimal_epub, source_url="https://standardebooks.org/example")
    first = normalize_source(source)
    second = normalize_source(source)
    reloaded = normalize_source(
        load_source(minimal_epub, source_url="https://standardebooks.org/example")
    )

    assert source.kind == "epub"
    assert len(source.sha256) == 64
    assert first == second
    assert first.id == reloaded.id
    assert first.edition_id == reloaded.edition_id
    assert [chapter.id for chapter in first.chapters] == [
        chapter.id for chapter in reloaded.chapters
    ]
    assert first.title == "The Test Voyage"
    assert first.authors == ("Ada Example",)
    assert first.language == "en-US"
    assert str(UUID(first.id)) == first.id
    assert str(UUID(first.edition_id)) == first.edition_id
    assert [chapter.title for chapter in first.chapters] == ["Chapter I", "Chapter II"]
    assert first.source.provider == "Standard Ebooks"
    assert first.source.url == "https://standardebooks.org/example"
    assert len(first.normalized_sha256) == 64
    assert "editor's note" not in first.chapters[0].text
    assert first.chapters[0].sentences[0].id.startswith("sentence_")
    assert len(first.chapters[0].paragraphs[0].content_sha256) == 64
    assert len(first.chapters[0].sentences[0].content_sha256) == 64


def test_candidates_are_reconstructed_and_exported_exactly(minimal_epub: Path) -> None:
    document = normalize_source(load_source(minimal_epub))
    candidates = generate_candidates(
        document, CandidateConfig(min_words=12, max_words=55, max_sentences=3)
    )
    selections = HeuristicSelector().select(candidates, max_passages=4)
    feed = export_feed(document, candidates, selections)

    assert candidates
    assert selections
    assert len(feed["passages"]) == len(selections)
    source_provenance = feed["book"]["source"]
    assert source_provenance["name"] == "Standard Ebooks"
    assert source_provenance["retrievedAt"].endswith("Z")
    assert len(source_provenance["normalizedSha256"]) == 64
    assert source_provenance["rights"]["basis"]
    for passage in feed["passages"]:
        chapter = next(item for item in document.chapters if item.id == passage["chapter"]["id"])
        start = passage["provenance"]["startOffset"]
        end = passage["provenance"]["endOffset"]
        assert passage["text"] == chapter.text[start:end]
        assert passage["status"] == "candidate"
        assert 0 <= passage["qualityScore"] <= 1
        assert str(UUID(passage["id"])) == passage["id"]
        assert passage["provenance"]["startSentenceOrdinal"] >= 1
        assert (
            passage["provenance"]["endSentenceOrdinal"]
            >= passage["provenance"]["startSentenceOrdinal"]
        )


def test_verifier_fails_closed_if_quote_is_modified(minimal_epub: Path) -> None:
    document = normalize_source(load_source(minimal_epub))
    candidate = generate_candidates(
        document, CandidateConfig(min_words=8, max_words=80, max_sentences=4)
    )[0]
    tampered = replace(candidate, text=candidate.text + " Invented ending.")

    with pytest.raises(VerificationError, match="differs"):
        verify_candidate(document, tampered)


def test_xhtml_and_text_inputs_are_supported(tmp_path: Path) -> None:
    xhtml_path = tmp_path / "chapter.xhtml"
    xhtml_path.write_text(CHAPTER_ONE, encoding="utf-8")
    xhtml = normalize_source(load_source(xhtml_path), title="XHTML Book", authors=("A. Writer",))
    assert xhtml.source.kind == "xhtml"
    assert xhtml.title == "XHTML Book"
    assert len(xhtml.chapters) == 1

    text_path = tmp_path / "book.txt"
    text_path.write_text(
        "CHAPTER I\n\nA first sentence opens the old road with patience and hope. "
        "A second sentence carries the traveler farther than expected.\n\n"
        "CHAPTER II\n\nThe last hill reveals a wide country beneath the evening sky. "
        "No map could have promised such a beautiful conclusion.\n",
        encoding="utf-8",
    )
    text = normalize_source(load_source(text_path), title="Text Book", authors=("A. Writer",))
    assert text.source.kind == "text"
    assert [chapter.title for chapter in text.chapters] == ["CHAPTER I", "CHAPTER II"]


def test_https_loader_records_final_url_and_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    class Headers(dict[str, str]):
        def get_content_type(self) -> str:
            return "application/xhtml+xml"

    class Response:
        headers = Headers()

        def __enter__(self) -> Response:
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def read(self, _: int) -> bytes:
            return CHAPTER_ONE.encode()

        def geturl(self) -> str:
            return "https://standardebooks.org/downloads/example/chapter.xhtml"

    monkeypatch.setattr("urllib.request.urlopen", lambda *_args, **_kwargs: Response())
    source = load_source("https://standardebooks.org/downloads/example/chapter.xhtml")
    assert source.source_url == "https://standardebooks.org/downloads/example/chapter.xhtml"
    assert source.download_url == "https://standardebooks.org/downloads/example/chapter.xhtml"
    assert source.kind == "xhtml"
    assert len(source.sha256) == 64

    with pytest.raises(SourceError, match="HTTPS"):
        load_source("http://example.com/book.epub")


def test_openai_adapter_uses_structured_outputs_and_only_accepts_known_ids(
    minimal_epub: Path,
) -> None:
    document = normalize_source(load_source(minimal_epub))
    candidates = generate_candidates(
        document, CandidateConfig(min_words=12, max_words=55, max_sentences=3)
    )

    class Responses:
        calls: list[dict[str, object]] = []

        def create(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            payload = json.loads(str(kwargs["input"]))
            candidate_id = payload["candidates"][0]["candidate_id"]
            return SimpleNamespace(
                output_text=json.dumps(
                    {
                        "selections": [
                            {
                                "candidate_id": candidate_id,
                                "score": 91,
                                "reason": "Self-contained and memorable.",
                                "themes": ["freedom"],
                                "content_flags": [],
                            }
                        ]
                    }
                )
            )

    responses = Responses()
    client = SimpleNamespace(responses=responses)
    selector = OpenAISelector(model="test-model", batch_size=100, client=client)
    selections = selector.select(candidates, max_passages=1)

    assert len(selections) == 1
    assert selections[0].candidate_id in {candidate.id for candidate in candidates}
    assert selections[0].model == "test-model"
    feed = export_feed(document, candidates, selections)
    assert feed["passages"][0]["text"] in {candidate.text for candidate in candidates}
    assert responses.calls[0]["store"] is False
    assert responses.calls[0]["text"]["format"]["type"] == "json_schema"
    assert (
        responses.calls[0]["text"]["format"]["schema"]["properties"]["selections"]["maxItems"] >= 1
    )


def test_openai_prefilter_bounds_large_candidate_sets_with_chapter_variety() -> None:
    text = (
        "A memorable passage carries a complete thought through vivid language and a clear "
        "ending that can stand alone for any thoughtful reader."
    )
    candidates = tuple(
        Candidate(
            id=f"candidate_{index:05d}",
            chapter_id=f"chapter_{index % 24:02d}",
            start_sentence_id=f"sentence_{index:05d}",
            end_sentence_id=f"sentence_{index:05d}",
            start_sentence_ordinal=index // 24 + 1,
            end_sentence_ordinal=index // 24 + 1,
            start_offset=index * 100,
            end_offset=index * 100 + len(text),
            text=text,
            text_sha256=f"{index:064x}"[-64:],
            word_count=22,
        )
        for index in range(13_612)
    )

    class BoundedResponses:
        calls: list[dict[str, object]] = []
        seen: list[dict[str, object]] = []

        def create(self, **kwargs: object) -> SimpleNamespace:
            self.calls.append(kwargs)
            payload = json.loads(str(kwargs["input"]))
            batch = payload["candidates"]
            self.seen.extend(batch)
            selected_id = batch[0]["candidate_id"]
            return SimpleNamespace(
                output_text=json.dumps(
                    {
                        "selections": [
                            {
                                "candidate_id": selected_id,
                                "score": 90,
                                "reason": "Strong standalone passage.",
                                "themes": [],
                                "content_flags": [],
                            }
                        ]
                    }
                )
            )

    responses = BoundedResponses()
    selector = OpenAISelector(client=SimpleNamespace(responses=responses))
    selections = selector.select(candidates, max_passages=50)
    all_ids = {candidate.id for candidate in candidates}
    seen_ids = {str(item["candidate_id"]) for item in responses.seen}

    assert len(responses.seen) == 50 * 8
    assert len(responses.calls) == 10
    assert len({item["chapter_id"] for item in responses.seen}) == 24
    assert seen_ids <= all_ids
    assert {selection.candidate_id for selection in selections} <= seen_ids
    assert len(selector._prefilter(candidates[:100], max_passages=1)) == 40
    assert len(selector._prefilter(candidates, max_passages=500)) == 800


def test_missing_author_fails_processing_and_export(minimal_epub: Path, tmp_path: Path) -> None:
    text_path = tmp_path / "anonymous.txt"
    text_path.write_text(
        "A complete sentence is long enough to become a candidate for this small test.",
        encoding="utf-8",
    )
    with pytest.raises(NormalizationError, match="--author"):
        normalize_source(load_source(text_path), title="Anonymous Test")

    document = normalize_source(load_source(minimal_epub))
    candidates = generate_candidates(
        document, CandidateConfig(min_words=12, max_words=55, max_sentences=3)
    )
    selections = HeuristicSelector().select(candidates, max_passages=1)
    with pytest.raises(VerificationError, match="--author"):
        export_feed(replace(document, authors=()), candidates, selections)


def test_cli_processes_epub_without_api_key(minimal_epub: Path, tmp_path: Path) -> None:
    output = tmp_path / "feed.json"
    normalized = tmp_path / "normalized.json"
    result = main(
        [
            "process",
            str(minimal_epub),
            "--selector",
            "heuristic",
            "--min-words",
            "12",
            "--max-passages",
            "3",
            "--output",
            str(output),
            "--normalized-output",
            str(normalized),
            "--pretty",
        ]
    )
    payload = json.loads(output.read_text())
    audit = json.loads(normalized.read_text())

    assert result == 0
    assert payload["schemaVersion"] == "1.0"
    assert 1 <= len(payload["passages"]) <= 3
    assert audit["book"]["source"]["sha256"] == payload["book"]["source"]["sha256"]


def test_feed_schema_is_valid_json() -> None:
    schema_path = Path(__file__).parents[2] / "corpus" / "schemas" / "feed.schema.json"
    schema = json.loads(schema_path.read_text())
    Draft202012Validator.check_schema(schema)
    assert schema["$schema"].endswith("2020-12/schema")
    assert "passage" in schema["$defs"]
    assert schema["$defs"]["book"]["properties"]["authors"]["minItems"] == 1
    assert schema["$defs"]["passage"]["properties"]["authors"]["minItems"] == 1


def test_verification_bundle_reproduces_original_epub(minimal_epub: Path) -> None:
    source = load_source(minimal_epub, source_url="https://example.org/book")
    document = normalize_source(source)
    candidates = generate_candidates(document)
    selections = HeuristicSelector().select(candidates, max_passages=3)
    before_export = datetime.now(UTC)
    feed = export_feed(document, candidates, selections, source=source)
    after_export = datetime.now(UTC)
    recording_times = {passage["curation"]["selectionRecordedAt"] for passage in feed["passages"]}
    assert len(recording_times) == 1
    assert before_export <= datetime.fromisoformat(recording_times.pop()) <= after_export
    assert [passage["curation"]["reason"] for passage in feed["passages"]] == [
        selection.reason for selection in selections
    ]
    verify_feed_bundle(feed)
    schema = json.loads((Path(__file__).parents[2] / "corpus/schemas/feed.schema.json").read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(feed)

    feed["verificationBundle"]["chapters"][0]["text"] += " Fabricated source text."
    with pytest.raises(VerificationError, match="differ from reproduced original source"):
        verify_feed_bundle(feed)


def test_verification_bundle_rejects_rewritten_quote_with_rehashed_text(minimal_epub: Path) -> None:
    from good_doomscroller_pipeline.ids import sha256_text

    source = load_source(minimal_epub, source_url="https://example.org/book")
    document = normalize_source(source)
    candidates = generate_candidates(document)
    feed = export_feed(document, candidates, HeuristicSelector().select(candidates), source=source)
    feed["passages"][0]["text"] += " This was never in the book."
    feed["passages"][0]["provenance"]["quoteSha256"] = sha256_text(feed["passages"][0]["text"])
    with pytest.raises(VerificationError, match="differs from its source-addressed text"):
        verify_feed_bundle(feed)


def _decision_review(feed: dict) -> dict:
    chapter = feed["verificationBundle"]["chapters"][0]
    return {
        "reviewedAt": "2026-09-13T03:00:00Z",
        "reviewKind": "retrospective-comparison",
        "summary": "A current comparison of two excerpts from the same preserved edition.",
        "alternative": {
            "chapterId": chapter["id"], "startOffset": 0, "endOffset": 40,
            "text": chapter["text"][:40],
        },
        "whySelected": "The selected passage presents its idea more clearly on its own.",
        "whyAlternativeNotSelected": "This alternative depends more on its surrounding text.",
        "limitation": "This is a retrospective comparison, not the original rejection log.",
    }


@pytest.mark.parametrize("review_kind", ["selection-comparison", "retrospective-comparison"])
def test_bundle_checks_comparison_against_reproduced_source(review_kind: str) -> None:
    fixture = Path(__file__).parents[2] / "apps/web/tests/fixtures/verified-feed.json"
    feed = json.loads(fixture.read_text())
    review = _decision_review(feed)
    review["reviewKind"] = review_kind
    feed["passages"][0]["curation"]["decisionReview"] = review
    verify_feed_bundle(feed)
    schema = json.loads((Path(__file__).parents[2] / "corpus/schemas/feed.schema.json").read_text())
    Draft202012Validator(schema, format_checker=FormatChecker()).validate(feed)
    review["alternative"]["text"] += " Invented words."
    with pytest.raises(VerificationError, match="alternative differs from its source slice"):
        verify_feed_bundle(feed)


@pytest.mark.parametrize("timestamp", [None, "2026-09-13", "2026-02-30T04:00:00Z"])
def test_bundle_rejects_invalid_note_recording_time(timestamp: str | None) -> None:
    fixture = Path(__file__).parents[2] / "apps/web/tests/fixtures/verified-feed.json"
    feed = json.loads(fixture.read_text())
    feed["passages"][0]["curation"]["selectionRecordedAt"] = timestamp
    with pytest.raises(VerificationError, match="Recording time"):
        verify_feed_bundle(feed)


@pytest.mark.parametrize("review_kind", ["selection-comparison", "retrospective-comparison"])
def test_downloaded_proof_is_verified_independently_and_rejects_changed_bytes(review_kind: str) -> None:
    from good_doomscroller_pipeline.ids import sha256_text

    fixture = Path(__file__).parents[2] / "apps/web/tests/fixtures/verified-feed.json"
    feed = json.loads(fixture.read_text())
    passage = feed["passages"][0]
    receipt = {
        "schemaVersion": "1.0", "action": "published", "passageId": passage["id"],
        "previousReceiptSha256": None,
        "book": {**feed["book"]}, "source": feed["book"]["source"],
        "chapter": {**passage["chapter"], "sha256": passage["provenance"]["chapterSha256"]},
        "quote": {
            **passage["provenance"], "text": passage["text"],
            "sha256": passage["provenance"]["quoteSha256"], "offsetUnit": "unicode-code-points",
        },
        "verification": {
            "method": "reproduced-normalization-and-exact-source-slice", "normalizationVersion": "1",
        },
    }
    receipt_json = json.dumps(receipt, ensure_ascii=False, separators=(",", ":"))
    proof = {
        "schemaVersion": "1.0", "receipt": receipt, "receiptJson": receipt_json,
        "receiptSha256": sha256_text(receipt_json),
        "history": [{"receiptJson": receipt_json, "receiptSha256": sha256_text(receipt_json)}],
        "normalizationInput": {**feed["book"]["source"], "language": feed["book"]["language"]},
        "normalizedSource": {
            "normalizationVersion": "1", "offsetUnit": "unicode-code-points",
            "chapterSeparator": "\n\n\n", "chapters": feed["verificationBundle"]["chapters"],
        },
    }
    original = base64.b64decode(feed["verificationBundle"]["originalSourceBase64"])
    verify_receipt_proof(proof, original)
    with pytest.raises(VerificationError, match="Original source file does not match"):
        verify_receipt_proof(proof, original + b" changed")

    receipt["selection"] = {"decisionReview": _decision_review(feed)}
    receipt["selection"]["decisionReview"]["reviewKind"] = review_kind
    receipt["selection"]["selectionRecordedAt"] = "2026-09-13T04:00:00Z"

    def update_receipt_bytes() -> None:
        serialized = json.dumps(receipt, ensure_ascii=False, separators=(",", ":"))
        proof["receiptJson"] = serialized
        proof["receiptSha256"] = sha256_text(serialized)
        proof["history"] = [{"receiptJson": serialized, "receiptSha256": sha256_text(serialized)}]

    update_receipt_bytes()
    verify_receipt_proof(proof, original)
    receipt["selection"]["decisionReview"]["alternative"]["text"] += " Invented words."
    update_receipt_bytes()
    with pytest.raises(VerificationError, match="alternative differs from its source slice"):
        verify_receipt_proof(proof, original)
    proof["receiptJson"] += " "
    with pytest.raises(VerificationError, match="recorded fingerprint"):
        verify_receipt_proof(proof, original)


def test_export_matches_feed_schema(minimal_epub: Path) -> None:
    document = normalize_source(load_source(minimal_epub))
    candidates = generate_candidates(
        document, CandidateConfig(min_words=12, max_words=55, max_sentences=3)
    )
    selections = HeuristicSelector().select(candidates, max_passages=4)
    feed = export_feed(document, candidates, selections)
    schema_path = Path(__file__).parents[2] / "corpus" / "schemas" / "feed.schema.json"
    validator = Draft202012Validator(
        json.loads(schema_path.read_text()), format_checker=FormatChecker()
    )
    validator.validate(feed)
