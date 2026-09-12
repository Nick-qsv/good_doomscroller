"""Immutable domain models used throughout the corpus pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

SourceKind = Literal["epub", "xhtml", "text"]
SelectorName = Literal["heuristic", "openai"]


@dataclass(frozen=True, slots=True)
class LoadedSource:
    data: bytes
    name: str
    kind: SourceKind
    sha256: str
    source_url: str | None
    download_url: str | None
    retrieved_at: str
    media_type: str


@dataclass(frozen=True, slots=True)
class SourceMetadata:
    provider: str
    file_name: str
    kind: SourceKind
    sha256: str
    media_type: str
    url: str | None = None
    download_url: str | None = None
    version: str | None = None
    retrieved_at: str = ""
    rights_status: str = "public-domain"
    rights_jurisdiction: str = "US"
    rights_basis: str = (
        "Public domain in the United States; verify rights in every deployment jurisdiction."
    )


@dataclass(frozen=True, slots=True)
class Sentence:
    id: str
    ordinal: int
    paragraph_id: str
    paragraph_ordinal: int
    text: str
    start_offset: int
    end_offset: int
    content_sha256: str


@dataclass(frozen=True, slots=True)
class Paragraph:
    id: str
    ordinal: int
    text: str
    start_offset: int
    end_offset: int
    content_sha256: str
    sentences: tuple[Sentence, ...]


@dataclass(frozen=True, slots=True)
class Chapter:
    id: str
    ordinal: int
    title: str
    locator: str
    text: str
    content_sha256: str
    paragraphs: tuple[Paragraph, ...]

    @property
    def sentences(self) -> tuple[Sentence, ...]:
        return tuple(sentence for paragraph in self.paragraphs for sentence in paragraph.sentences)


@dataclass(frozen=True, slots=True)
class BookDocument:
    id: str
    edition_id: str
    slug: str
    title: str
    authors: tuple[str, ...]
    language: str | None
    normalized_sha256: str
    source: SourceMetadata
    chapters: tuple[Chapter, ...]


@dataclass(frozen=True, slots=True)
class Candidate:
    id: str
    chapter_id: str
    start_sentence_id: str
    end_sentence_id: str
    start_sentence_ordinal: int
    end_sentence_ordinal: int
    start_offset: int
    end_offset: int
    text: str
    text_sha256: str
    word_count: int


@dataclass(frozen=True, slots=True)
class PassageSelection:
    candidate_id: str
    selector: SelectorName
    score: float
    reason: str
    themes: tuple[str, ...] = field(default_factory=tuple)
    content_flags: tuple[str, ...] = field(default_factory=tuple)
    model: str | None = None
