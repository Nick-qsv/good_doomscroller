"""Command-line entry point for processing selected public-domain books."""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from .candidates import CandidateConfig, generate_candidates
from .export import export_feed, normalized_document_to_dict
from .normalize import NormalizationError, normalize_source
from .openai_selector import OpenAISelector
from .selectors import HeuristicSelector
from .source import SourceError, load_source
from .verify import VerificationError


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="good-doomscroll",
        description=(
            "Normalize a Standard Ebooks EPUB (or XHTML/TXT), select exact source passages, "
            "and export web-ready JSON."
        ),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    process = subparsers.add_parser("process", help="ingest, select, verify, and export one book")
    process.add_argument(
        "source",
        help="local EPUB/XHTML/TXT path or direct HTTPS .epub download URL",
    )
    process.add_argument(
        "--output",
        "-o",
        default="-",
        help="web-ready JSON destination (default: stdout)",
    )
    process.add_argument(
        "--normalized-output",
        help="optional normalized audit JSON destination",
    )
    process.add_argument(
        "--selector",
        choices=("heuristic", "openai"),
        default="heuristic",
        help="keyless deterministic selection or optional OpenAI Responses API selection",
    )
    process.add_argument(
        "--model",
        default=os.environ.get("OPENAI_MODEL", "gpt-5.4-mini"),
        help="OpenAI model ID used only with --selector openai",
    )
    process.add_argument("--title", help="override embedded book title")
    process.add_argument(
        "--author",
        action="append",
        dest="authors",
        help="override embedded author; repeat for multiple authors",
    )
    process.add_argument("--language", help="override embedded BCP-47 language tag")
    process.add_argument("--slug", help="override the URL-safe book slug")
    process.add_argument(
        "--source-url",
        help=("canonical provenance URL (remote inputs default to their final download URL)"),
    )
    process.add_argument("--source-provider", default="Standard Ebooks")
    process.add_argument("--source-version")
    process.add_argument("--rights-status", default="public-domain")
    process.add_argument("--rights-jurisdiction", default="US")
    process.add_argument(
        "--rights-basis",
        default=(
            "Public domain in the United States; verify rights in every deployment jurisdiction."
        ),
    )
    process.add_argument("--min-words", type=int, default=18)
    process.add_argument("--max-words", type=int, default=80)
    process.add_argument("--max-sentences", type=int, default=6)
    process.add_argument("--max-passages", type=int, default=50)
    process.add_argument("--pretty", action="store_true", help="indent JSON output")
    verify = subparsers.add_parser(
        "verify", help="reproduce source normalization and verify a feed"
    )
    verify.add_argument("feed", help="feed JSON path, or - to read stdin")
    proof = subparsers.add_parser(
        "verify-proof", help="verify downloaded receipt JSON against its original source file"
    )
    proof.add_argument("proof", help="downloaded public proof JSON")
    proof.add_argument("source", help="downloaded original source bytes")
    return parser


def _write_json(value: dict[str, Any], destination: str, *, pretty: bool) -> None:
    text = json.dumps(
        value,
        ensure_ascii=False,
        indent=2 if pretty else None,
        separators=None if pretty else (",", ":"),
        sort_keys=False,
    )
    if destination == "-":
        print(text)
        return
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text + "\n", encoding="utf-8")


def _process(args: argparse.Namespace) -> int:
    source = load_source(args.source, source_url=args.source_url)
    document = normalize_source(
        source,
        title=args.title,
        authors=tuple(args.authors) if args.authors else None,
        language=args.language,
        slug=args.slug,
        rights_status=args.rights_status,
        rights_jurisdiction=args.rights_jurisdiction,
        rights_basis=args.rights_basis,
        source_provider=args.source_provider,
        source_version=args.source_version,
    )
    config = CandidateConfig(
        min_words=args.min_words,
        max_words=args.max_words,
        max_sentences=args.max_sentences,
    )
    candidates = generate_candidates(document, config)
    if args.selector == "openai":
        selector = OpenAISelector(model=args.model)
    else:
        selector = HeuristicSelector()
    selections = selector.select(candidates, max_passages=args.max_passages)
    feed = export_feed(document, candidates, selections, source=source)
    _write_json(feed, args.output, pretty=args.pretty)
    if args.normalized_output:
        _write_json(
            normalized_document_to_dict(document), args.normalized_output, pretty=args.pretty
        )
    print(
        (
            f"Processed {document.title!r}: {len(document.chapters)} chapters, "
            f"{len(candidates)} candidates, {len(selections)} verified passages "
            f"using {args.selector}."
        ),
        file=sys.stderr,
    )
    if not selections:
        print(
            "No passage met the current limits; try lowering --min-words or increasing "
            "--max-sentences.",
            file=sys.stderr,
        )
    return 0


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        if args.command == "process":
            return _process(args)
        if args.command == "verify":
            from .verify_bundle import verify_feed_bundle

            raw = sys.stdin.read() if args.feed == "-" else Path(args.feed).read_text("utf-8")
            verify_feed_bundle(json.loads(raw))
            print("Original source, normalized chapters, and exact quotes verified.")
            return 0
        if args.command == "verify-proof":
            from .verify_proof import verify_receipt_proof

            verify_receipt_proof(
                json.loads(Path(args.proof).read_text("utf-8")), Path(args.source).read_bytes()
            )
            print("Source normalization, exact quote, receipt hash, and supplied history verified.")
            print("Publisher identity, operator identity, and timestamps are not authenticated.")
            return 0
    except (SourceError, NormalizationError, VerificationError, ValueError, RuntimeError) as exc:
        parser.error(str(exc))
    return 2
