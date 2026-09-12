"""Deterministically generate source-addressable quotation candidates."""

from __future__ import annotations

import re
from dataclasses import dataclass

from .ids import sha256_text, stable_id
from .models import BookDocument, Candidate

_WORD = re.compile(r"[^\W_]+(?:[’'][^\W_]+)*", re.UNICODE)


@dataclass(frozen=True, slots=True)
class CandidateConfig:
    min_words: int = 18
    max_words: int = 80
    max_sentences: int = 6

    def __post_init__(self) -> None:
        if self.min_words < 1:
            raise ValueError("min_words must be at least 1")
        if self.max_words < self.min_words:
            raise ValueError("max_words must be greater than or equal to min_words")
        if self.max_sentences < 1:
            raise ValueError("max_sentences must be at least 1")


def count_words(text: str) -> int:
    return len(_WORD.findall(text))


def generate_candidates(
    document: BookDocument, config: CandidateConfig | None = None
) -> tuple[Candidate, ...]:
    """Generate every sentence-boundary window inside configured size limits."""

    config = config or CandidateConfig()
    candidates: list[Candidate] = []
    for chapter in document.chapters:
        sentences = chapter.sentences
        for start_index, start_sentence in enumerate(sentences):
            max_end = min(len(sentences), start_index + config.max_sentences)
            for end_index in range(start_index, max_end):
                end_sentence = sentences[end_index]
                text = chapter.text[start_sentence.start_offset : end_sentence.end_offset]
                word_count = count_words(text)
                if word_count > config.max_words:
                    break
                if word_count < config.min_words:
                    continue
                text_hash = sha256_text(text)
                candidates.append(
                    Candidate(
                        id=stable_id(
                            "candidate",
                            document.edition_id,
                            chapter.id,
                            start_sentence.id,
                            end_sentence.id,
                        ),
                        chapter_id=chapter.id,
                        start_sentence_id=start_sentence.id,
                        end_sentence_id=end_sentence.id,
                        start_sentence_ordinal=start_sentence.ordinal,
                        end_sentence_ordinal=end_sentence.ordinal,
                        start_offset=start_sentence.start_offset,
                        end_offset=end_sentence.end_offset,
                        text=text,
                        text_sha256=text_hash,
                        word_count=word_count,
                    )
                )
    return tuple(candidates)
