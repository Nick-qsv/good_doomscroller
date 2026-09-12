"""Optional Responses API selector. Model output can choose IDs but cannot write quotes."""

from __future__ import annotations

import json
import math
import os
from bisect import bisect_left
from collections import defaultdict
from copy import deepcopy
from typing import Any

from .models import Candidate, PassageSelection
from .selectors import heuristic_features

_SELECTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "selections": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "candidate_id": {"type": "string"},
                    "score": {"type": "number", "minimum": 0, "maximum": 100},
                    "reason": {"type": "string"},
                    "themes": {"type": "array", "items": {"type": "string"}},
                    "content_flags": {"type": "array", "items": {"type": "string"}},
                },
                "required": [
                    "candidate_id",
                    "score",
                    "reason",
                    "themes",
                    "content_flags",
                ],
            },
        }
    },
    "required": ["selections"],
}


def _overlaps(candidate: Candidate, selected: list[Candidate]) -> bool:
    return any(
        other.chapter_id == candidate.chapter_id
        and candidate.start_sentence_ordinal <= other.end_sentence_ordinal
        and other.start_sentence_ordinal <= candidate.end_sentence_ordinal
        for other in selected
    )


class OpenAISelector:
    """Rank source-derived candidates with Structured Outputs from the Responses API."""

    name = "openai"

    def __init__(
        self,
        *,
        model: str | None = None,
        batch_size: int = 40,
        prefilter_multiplier: int = 8,
        prefilter_floor: int = 40,
        prefilter_cap: int = 800,
        client: Any | None = None,
    ) -> None:
        if batch_size < 1:
            raise ValueError("batch_size must be at least 1")
        if prefilter_multiplier < 1:
            raise ValueError("prefilter_multiplier must be at least 1")
        if prefilter_floor < 1:
            raise ValueError("prefilter_floor must be at least 1")
        if prefilter_cap < prefilter_floor:
            raise ValueError("prefilter_cap must be greater than or equal to prefilter_floor")
        self.model = model or os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
        self.batch_size = batch_size
        self.prefilter_multiplier = prefilter_multiplier
        self.prefilter_floor = prefilter_floor
        self.prefilter_cap = prefilter_cap
        if client is None:
            if not os.environ.get("OPENAI_API_KEY"):
                raise RuntimeError(
                    "OPENAI_API_KEY is required for --selector openai; use --selector heuristic "
                    "until a key is configured."
                )
            try:
                from openai import OpenAI
            except ImportError as exc:
                raise RuntimeError(
                    "Install the optional adapter with: pip install -e '.[openai]'"
                ) from exc
            client = OpenAI()
        self.client = client

    @staticmethod
    def _non_overlapping_pool(
        candidates: list[Candidate],
    ) -> tuple[list[Candidate], list[Candidate]]:
        """Prefer distinct source ranges while retaining overlaps as a fill pool."""

        accepted: list[Candidate] = []
        deferred: list[Candidate] = []
        starts: list[int] = []
        intervals: list[tuple[int, int]] = []
        for candidate in candidates:
            index = bisect_left(starts, candidate.start_sentence_ordinal)
            overlaps_previous = index > 0 and (
                intervals[index - 1][1] >= candidate.start_sentence_ordinal
            )
            overlaps_next = index < len(intervals) and (
                intervals[index][0] <= candidate.end_sentence_ordinal
            )
            if overlaps_previous or overlaps_next:
                deferred.append(candidate)
                continue
            starts.insert(index, candidate.start_sentence_ordinal)
            intervals.insert(
                index, (candidate.start_sentence_ordinal, candidate.end_sentence_ordinal)
            )
            accepted.append(candidate)
        return accepted, deferred

    @staticmethod
    def _round_robin(
        groups: dict[str, list[Candidate]],
        chapter_order: list[str],
        limit: int,
        selected: list[Candidate],
    ) -> None:
        positions = {chapter_id: 0 for chapter_id in chapter_order}
        while len(selected) < limit:
            progressed = False
            for chapter_id in chapter_order:
                position = positions[chapter_id]
                group = groups.get(chapter_id, [])
                if position >= len(group):
                    continue
                selected.append(group[position])
                positions[chapter_id] = position + 1
                progressed = True
                if len(selected) >= limit:
                    return
            if not progressed:
                return

    def _prefilter(
        self, candidates: tuple[Candidate, ...], max_passages: int
    ) -> tuple[Candidate, ...]:
        """Bound API input with deterministic quality, range, and chapter diversity."""

        limit = min(
            len(candidates),
            min(
                self.prefilter_cap,
                max(self.prefilter_floor, max_passages * self.prefilter_multiplier),
            ),
        )
        if len(candidates) <= limit:
            return candidates

        scored = [(candidate, heuristic_features(candidate)[0]) for candidate in candidates]
        scored.sort(key=lambda item: (-item[1], item[0].id))
        ranked_by_chapter: dict[str, list[Candidate]] = defaultdict(list)
        for candidate, _score in scored:
            ranked_by_chapter[candidate.chapter_id].append(candidate)
        chapter_order = list(ranked_by_chapter)

        distinct_by_chapter: dict[str, list[Candidate]] = {}
        overlapping_by_chapter: dict[str, list[Candidate]] = {}
        for chapter_id in chapter_order:
            distinct, overlapping = self._non_overlapping_pool(ranked_by_chapter[chapter_id])
            distinct_by_chapter[chapter_id] = distinct
            overlapping_by_chapter[chapter_id] = overlapping

        selected: list[Candidate] = []
        self._round_robin(distinct_by_chapter, chapter_order, limit, selected)
        if len(selected) < limit:
            self._round_robin(overlapping_by_chapter, chapter_order, limit, selected)
        return tuple(selected)

    def _select_batch(
        self, candidates: tuple[Candidate, ...], requested: int
    ) -> list[dict[str, Any]]:
        schema = deepcopy(_SELECTION_SCHEMA)
        schema["properties"]["selections"]["maxItems"] = requested
        payload = {
            "maximum_selections": requested,
            "candidates": [
                {
                    "candidate_id": candidate.id,
                    "chapter_id": candidate.chapter_id,
                    "word_count": candidate.word_count,
                    "text": candidate.text,
                }
                for candidate in candidates
            ],
        }
        response = self.client.responses.create(
            model=self.model,
            store=False,
            instructions=(
                "You curate memorable, self-contained passages from public-domain books. "
                "Select only IDs in the supplied candidate list. Prefer striking prose that "
                "works without surrounding context, reward variety, and flag sensitive content. "
                "Never rewrite, complete, or quote a passage; return candidate IDs and metadata "
                "only."
            ),
            input=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            text={
                "format": {
                    "type": "json_schema",
                    "name": "passage_selections",
                    "strict": True,
                    "schema": schema,
                }
            },
            max_output_tokens=2_500,
        )
        output_text = getattr(response, "output_text", None)
        if not output_text:
            raise RuntimeError("OpenAI selector returned no structured output text.")
        try:
            value = json.loads(output_text)
            selections = value["selections"]
        except (json.JSONDecodeError, KeyError, TypeError) as exc:
            raise RuntimeError("OpenAI selector returned invalid structured output.") from exc
        if not isinstance(selections, list):
            raise RuntimeError("OpenAI selector returned a non-list selections value.")
        batch_ids = {candidate.id for candidate in candidates}
        for item in selections:
            if not isinstance(item, dict) or item.get("candidate_id") not in batch_ids:
                raise RuntimeError(
                    "OpenAI selector returned a candidate ID outside its supplied batch."
                )
        return selections

    def select(
        self, candidates: tuple[Candidate, ...], *, max_passages: int = 50
    ) -> tuple[PassageSelection, ...]:
        if max_passages < 1:
            raise ValueError("max_passages must be at least 1")
        if not candidates:
            return ()
        candidate_map = {candidate.id: candidate for candidate in candidates}
        if len(candidate_map) != len(candidates):
            raise ValueError("Candidate IDs must be unique.")
        model_candidates = self._prefilter(candidates, max_passages)
        batch_count = math.ceil(len(model_candidates) / self.batch_size)
        per_batch = max(1, math.ceil(max_passages / batch_count) * 2)
        raw: list[dict[str, Any]] = []
        for index in range(0, len(model_candidates), self.batch_size):
            batch = model_candidates[index : index + self.batch_size]
            raw.extend(self._select_batch(batch, min(per_batch, len(batch))))

        best_by_id: dict[str, dict[str, Any]] = {}
        for item in raw:
            if not isinstance(item, dict) or not isinstance(item.get("candidate_id"), str):
                raise RuntimeError("OpenAI selector returned a malformed selection item.")
            candidate_id = item["candidate_id"]
            if candidate_id not in candidate_map:
                raise RuntimeError(
                    f"OpenAI selector returned an unknown candidate ID: {candidate_id}"
                )
            try:
                score = float(item["score"])
            except (KeyError, TypeError, ValueError) as exc:
                raise RuntimeError("OpenAI selector returned a malformed score.") from exc
            if not 0 <= score <= 100:
                raise RuntimeError("OpenAI selector returned a score outside 0..100.")
            normalized = {**item, "score": score}
            previous = best_by_id.get(candidate_id)
            if previous is None or score > float(previous["score"]):
                best_by_id[candidate_id] = normalized

        ranked = sorted(
            best_by_id.values(), key=lambda item: (-item["score"], item["candidate_id"])
        )
        selected_candidates: list[Candidate] = []
        result: list[PassageSelection] = []
        for item in ranked:
            candidate = candidate_map[item["candidate_id"]]
            if _overlaps(candidate, selected_candidates):
                continue
            selected_candidates.append(candidate)
            themes = item.get("themes", [])
            flags = item.get("content_flags", [])
            if not isinstance(themes, list) or not all(isinstance(value, str) for value in themes):
                raise RuntimeError("OpenAI selector returned malformed themes.")
            if not isinstance(flags, list) or not all(isinstance(value, str) for value in flags):
                raise RuntimeError("OpenAI selector returned malformed content flags.")
            result.append(
                PassageSelection(
                    candidate_id=candidate.id,
                    selector="openai",
                    model=self.model,
                    score=round(float(item["score"]), 3),
                    reason=str(item.get("reason", "")),
                    themes=tuple(dict.fromkeys(themes)),
                    content_flags=tuple(dict.fromkeys(flags)),
                )
            )
            if len(result) >= max_passages:
                break
        return tuple(result)
