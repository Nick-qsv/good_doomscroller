"""Keyless heuristic passage curation."""

from __future__ import annotations

import math
import re
from collections import defaultdict

from .models import Candidate, PassageSelection

_WORD = re.compile(r"[^\W_]+(?:[’'][^\W_]+)*", re.UNICODE)
_CONTEXTUAL_OPENERS = {
    "and",
    "but",
    "he",
    "her",
    "him",
    "his",
    "it",
    "she",
    "that",
    "then",
    "they",
    "this",
    "those",
    "we",
}
_THEME_WORDS: dict[str, frozenset[str]] = {
    "ambition": frozenset({"ambition", "aspire", "fame", "glory", "power", "success"}),
    "freedom": frozenset({"free", "freedom", "liberty", "prison", "slave"}),
    "identity": frozenset({"identity", "myself", "self", "soul", "who"}),
    "knowledge": frozenset({"book", "learn", "knowledge", "read", "truth", "wisdom"}),
    "love": frozenset({"affection", "beloved", "heart", "love", "lover"}),
    "mortality": frozenset({"death", "die", "dying", "grave", "life", "mortal"}),
    "nature": frozenset({"earth", "forest", "moon", "nature", "sea", "sky", "sun"}),
    "society": frozenset({"country", "law", "people", "society", "state", "world"}),
    "time": frozenset({"age", "future", "hour", "past", "time", "years"}),
}
_FLAG_WORDS: dict[str, frozenset[str]] = {
    "violence": frozenset({"blood", "dagger", "gun", "kill", "murder", "sword", "wound"}),
    "self-harm": frozenset({"suicide"}),
}


def heuristic_features(
    candidate: Candidate,
) -> tuple[float, str, tuple[str, ...], tuple[str, ...]]:
    """Return the deterministic baseline score and labels for a candidate."""

    words = [word.casefold() for word in _WORD.findall(candidate.text)]
    unique_ratio = len(set(words)) / max(1, len(words))
    target_length_score = max(0.0, 24.0 - abs(candidate.word_count - 42) * 0.65)
    score = 40.0 + target_length_score + unique_ratio * 18.0
    reasons: list[str] = []

    if candidate.text.endswith((".", "!", "?", ".”", "!”", "?”", ".'", "!'", "?'")):
        score += 5.0
        reasons.append("complete ending")
    else:
        score -= 12.0
    if any(mark in candidate.text for mark in ("?", "!", ";", ":", "—")):
        score += 5.0
        reasons.append("expressive phrasing")
    if words and words[0] in _CONTEXTUAL_OPENERS:
        score -= 9.0
    if candidate.text[:1].islower():
        score -= 12.0
    if "\n\n" in candidate.text:
        score += 2.0
    if unique_ratio >= 0.72:
        reasons.append("distinctive language")
    if candidate.word_count < 24:
        score -= 4.0

    word_set = set(words)
    themes = tuple(theme for theme, vocabulary in _THEME_WORDS.items() if word_set & vocabulary)
    flags = tuple(flag for flag, vocabulary in _FLAG_WORDS.items() if word_set & vocabulary)
    if themes:
        score += min(6.0, len(themes) * 2.0)
        reasons.append("thematic resonance")
    reason = ", ".join(reasons[:3]) or "clear, self-contained source passage"
    return min(100.0, max(0.0, score)), reason, themes, flags


def _overlaps(candidate: Candidate, selected: list[Candidate]) -> bool:
    return any(
        other.chapter_id == candidate.chapter_id
        and candidate.start_sentence_ordinal <= other.end_sentence_ordinal
        and other.start_sentence_ordinal <= candidate.end_sentence_ordinal
        for other in selected
    )


class HeuristicSelector:
    """A deterministic baseline that requires no network access or API key."""

    name = "heuristic"

    def select(
        self, candidates: tuple[Candidate, ...], *, max_passages: int = 50
    ) -> tuple[PassageSelection, ...]:
        if max_passages < 1:
            raise ValueError("max_passages must be at least 1")
        if not candidates:
            return ()

        scored = [(candidate, *heuristic_features(candidate)) for candidate in candidates]
        scored.sort(key=lambda item: (-item[1], item[0].id))
        chapter_count = len({candidate.chapter_id for candidate in candidates})
        soft_chapter_cap = max(1, math.ceil(max_passages / max(1, chapter_count)) + 1)
        chapter_totals: dict[str, int] = defaultdict(int)
        selected_candidates: list[Candidate] = []
        selections: list[PassageSelection] = []

        def add_candidates(*, enforce_chapter_cap: bool) -> None:
            for candidate, score, reason, themes, flags in scored:
                if len(selections) >= max_passages:
                    return
                if any(item.candidate_id == candidate.id for item in selections):
                    continue
                if enforce_chapter_cap and chapter_totals[candidate.chapter_id] >= soft_chapter_cap:
                    continue
                if _overlaps(candidate, selected_candidates):
                    continue
                selected_candidates.append(candidate)
                chapter_totals[candidate.chapter_id] += 1
                selections.append(
                    PassageSelection(
                        candidate_id=candidate.id,
                        selector="heuristic",
                        score=round(score, 3),
                        reason=reason,
                        themes=themes,
                        content_flags=flags,
                    )
                )

        add_candidates(enforce_chapter_cap=True)
        add_candidates(enforce_chapter_cap=False)
        return tuple(selections)
