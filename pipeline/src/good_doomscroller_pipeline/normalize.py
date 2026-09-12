"""Normalize EPUB, XHTML, and plain-text books into offset-addressable prose."""

from __future__ import annotations

import html
import posixpath
import re
import unicodedata
import urllib.parse
import zipfile
from dataclasses import dataclass
from html.parser import HTMLParser
from io import BytesIO
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET

from .ids import sha256_text, slugify, stable_id, stable_uuid
from .models import (
    BookDocument,
    Chapter,
    LoadedSource,
    Paragraph,
    Sentence,
    SourceMetadata,
)

CONTAINER_NS = "urn:oasis:names:tc:opendocument:xmlns:container"
DC_NS = "http://purl.org/dc/elements/1.1/"
OPF_NS = "http://www.idpf.org/2007/opf"
EPUB_NS = "http://www.idpf.org/2007/ops"
MAX_EPUB_MEMBER_BYTES = 25 * 1024 * 1024
MAX_EPUB_UNCOMPRESSED_BYTES = 250 * 1024 * 1024

_EXCLUDED_FILE_TOKENS = {
    "bibliography",
    "colophon",
    "copyright-page",
    "cover",
    "endnotes",
    "glossary",
    "imprint",
    "index",
    "loi",
    "nav",
    "titlepage",
    "toc",
    "uncopyright",
}
_EXCLUDED_SEMANTICS = {
    "bibliography",
    "colophon",
    "copyright-page",
    "cover",
    "endnotes",
    "glossary",
    "imprint",
    "index",
    "landmarks",
    "loi",
    "titlepage",
    "toc",
}
_IGNORED_ELEMENTS = {"script", "style", "nav", "aside", "svg", "math"}
_BLOCK_ELEMENTS = {"p", "li"}
_CHAPTER_HEADING = re.compile(
    r"^(?:(?:chapter|book|part)\s+(?:[ivxlcdm]+|\d+|[a-z]+)(?:[. :\-—].*)?"
    r"|prologue|epilogue|preface|introduction)$",
    re.IGNORECASE,
)
_SENTENCE_END = re.compile(r"[.!?]+(?:[\"'”’\)\]]+)?(?=\s+|$)")
_ABBREVIATIONS = {
    "capt",
    "col",
    "dr",
    "etc",
    "fig",
    "gen",
    "jr",
    "lt",
    "mr",
    "mrs",
    "ms",
    "no",
    "prof",
    "rev",
    "sen",
    "sr",
    "st",
    "vs",
}


class NormalizationError(ValueError):
    """Raised when a supported source cannot be normalized."""


@dataclass(frozen=True, slots=True)
class _RawChapter:
    title: str
    locator: str
    paragraphs: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class _ParsedBook:
    title: str | None
    authors: tuple[str, ...]
    language: str | None
    chapters: tuple[_RawChapter, ...]


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _clean_text(value: str) -> str:
    value = html.unescape(value)
    value = unicodedata.normalize("NFC", value)
    value = value.replace("\u00a0", " ").replace("\u00ad", "")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[\t\f\v ]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n{2,}", "\n", value)
    return value.strip()


def _clean_inline_text(value: str) -> str:
    marker = "\ue000"
    value = value.replace("\n", " ").replace("\r", " ")
    value = re.sub(r"\s+", " ", value)
    value = value.replace(marker, "\n")
    return _clean_text(value)


def _element_text(element: ET.Element) -> str:
    marker = "\ue000"
    parts: list[str] = []

    def visit(node: ET.Element) -> None:
        name = _local_name(node.tag)
        if name in _IGNORED_ELEMENTS:
            return
        if node.text:
            parts.append(node.text)
        for child in node:
            if _local_name(child.tag) == "br":
                parts.append(marker)
            else:
                visit(child)
            if child.tail:
                parts.append(child.tail)

    visit(element)
    return _clean_inline_text("".join(parts))


def _semantic_tokens(element: ET.Element) -> set[str]:
    value = element.attrib.get(f"{{{EPUB_NS}}}type", "") or element.attrib.get("epub:type", "")
    return {token.lower() for token in value.split()}


def _xml_blocks(root: ET.Element) -> tuple[str, ...]:
    blocks: list[str] = []

    def walk(node: ET.Element, inside_block: bool = False, excluded: bool = False) -> None:
        name = _local_name(node.tag)
        excluded = (
            excluded
            or name in _IGNORED_ELEMENTS
            or bool(_semantic_tokens(node) & _EXCLUDED_SEMANTICS)
        )
        if excluded:
            return
        is_block = name in _BLOCK_ELEMENTS
        if is_block and not inside_block:
            value = _element_text(node)
            if value:
                blocks.append(value)
            return
        for child in node:
            walk(child, inside_block or is_block, excluded)

    body = next((node for node in root.iter() if _local_name(node.tag) == "body"), root)
    walk(body)
    if not blocks:
        fallback = _element_text(body)
        if fallback:
            blocks.append(fallback)
    return tuple(blocks)


def _xml_heading(root: ET.Element) -> str | None:
    for node in root.iter():
        if _local_name(node.tag) in {"h1", "h2", "h3"}:
            value = _element_text(node)
            if value:
                return value
    for node in root.iter():
        if _local_name(node.tag) == "title":
            value = _element_text(node)
            if value:
                return value
    return None


class _FallbackHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.blocks: list[str] = []
        self.headings: list[str] = []
        self._ignored_depth = 0
        self._block_depth = 0
        self._heading_depth = 0
        self._block_parts: list[str] = []
        self._heading_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag in _IGNORED_ELEMENTS:
            self._ignored_depth += 1
            return
        if self._ignored_depth:
            return
        if tag in _BLOCK_ELEMENTS:
            if self._block_depth == 0:
                self._block_parts = []
            self._block_depth += 1
        if tag in {"h1", "h2", "h3", "title"}:
            if self._heading_depth == 0:
                self._heading_parts = []
            self._heading_depth += 1
        if tag == "br":
            if self._block_depth:
                self._block_parts.append("\ue000")
            if self._heading_depth:
                self._heading_parts.append(" ")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag.lower() != "br":
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in _IGNORED_ELEMENTS:
            if self._ignored_depth:
                self._ignored_depth -= 1
            return
        if self._ignored_depth:
            return
        if tag in _BLOCK_ELEMENTS and self._block_depth:
            self._block_depth -= 1
            if self._block_depth == 0:
                value = _clean_inline_text("".join(self._block_parts))
                if value:
                    self.blocks.append(value)
        if tag in {"h1", "h2", "h3", "title"} and self._heading_depth:
            self._heading_depth -= 1
            if self._heading_depth == 0:
                value = _clean_inline_text("".join(self._heading_parts))
                if value:
                    self.headings.append(value)

    def handle_data(self, data: str) -> None:
        if self._ignored_depth:
            return
        if self._block_depth:
            self._block_parts.append(data)
        if self._heading_depth:
            self._heading_parts.append(data)


def _parse_xhtml_document(data: bytes, locator: str, ordinal: int) -> _RawChapter | None:
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        parser = _FallbackHTMLParser()
        try:
            parser.feed(data.decode("utf-8-sig"))
        except UnicodeDecodeError as exc:
            raise NormalizationError(f"XHTML is not valid UTF-8: {locator}") from exc
        blocks = tuple(parser.blocks)
        heading = parser.headings[0] if parser.headings else None
    else:
        body = next((node for node in root.iter() if _local_name(node.tag) == "body"), root)
        if _semantic_tokens(body) & _EXCLUDED_SEMANTICS:
            return None
        blocks = _xml_blocks(root)
        heading = _xml_heading(root)
    if not blocks:
        return None
    return _RawChapter(
        title=heading or f"Chapter {ordinal}",
        locator=locator,
        paragraphs=blocks,
    )


def _safe_epub_path(base: str, href: str) -> str:
    href_path = urllib.parse.unquote(urllib.parse.urlsplit(href).path)
    path = posixpath.normpath(posixpath.join(base, href_path))
    if path.startswith("../") or path.startswith("/"):
        raise NormalizationError(f"Unsafe EPUB member path: {href}")
    return str(PurePosixPath(path))


def _archive_read(archive: zipfile.ZipFile, name: str) -> bytes:
    try:
        info = archive.getinfo(name)
    except KeyError as exc:
        raise NormalizationError(f"EPUB references a missing member: {name}") from exc
    if info.file_size > MAX_EPUB_MEMBER_BYTES:
        raise NormalizationError(f"EPUB member is too large: {name}")
    return archive.read(info)


def _metadata_text(root: ET.Element, namespace: str, name: str) -> tuple[str, ...]:
    values: list[str] = []
    for node in root.iter(f"{{{namespace}}}{name}"):
        if node.text and (value := _clean_text(node.text)):
            values.append(value)
    return tuple(values)


def _parse_epub(source: LoadedSource) -> _ParsedBook:
    try:
        archive = zipfile.ZipFile(BytesIO(source.data))
    except zipfile.BadZipFile as exc:
        raise NormalizationError(
            "Input has an .epub extension but is not a valid ZIP archive."
        ) from exc
    with archive:
        total_size = sum(info.file_size for info in archive.infolist())
        if total_size > MAX_EPUB_UNCOMPRESSED_BYTES:
            raise NormalizationError("EPUB expands beyond the 250 MiB safety limit.")
        try:
            container = ET.fromstring(_archive_read(archive, "META-INF/container.xml"))
        except ET.ParseError as exc:
            raise NormalizationError("EPUB container.xml is malformed.") from exc
        rootfile = container.find(f".//{{{CONTAINER_NS}}}rootfile")
        if rootfile is None or not rootfile.attrib.get("full-path"):
            raise NormalizationError("EPUB container does not name an OPF package document.")
        opf_path = rootfile.attrib["full-path"]
        try:
            package = ET.fromstring(_archive_read(archive, opf_path))
        except ET.ParseError as exc:
            raise NormalizationError("EPUB package document is malformed.") from exc

        title_values = _metadata_text(package, DC_NS, "title")
        authors = _metadata_text(package, DC_NS, "creator")
        languages = _metadata_text(package, DC_NS, "language")
        opf_dir = posixpath.dirname(opf_path)

        manifest: dict[str, tuple[str, str, set[str]]] = {}
        for item in package.findall(f".//{{{OPF_NS}}}manifest/{{{OPF_NS}}}item"):
            item_id = item.attrib.get("id")
            href = item.attrib.get("href")
            if item_id and href:
                manifest[item_id] = (
                    href,
                    item.attrib.get("media-type", ""),
                    set(item.attrib.get("properties", "").split()),
                )

        spine_ids = [
            item.attrib["idref"]
            for item in package.findall(f".//{{{OPF_NS}}}spine/{{{OPF_NS}}}itemref")
            if item.attrib.get("idref")
        ]
        if not spine_ids:
            spine_ids = list(manifest)

        chapters: list[_RawChapter] = []
        for item_id in spine_ids:
            item = manifest.get(item_id)
            if item is None:
                continue
            href, media_type, properties = item
            filename_tokens = set(re.split(r"[^a-z0-9]+", href.lower()))
            if (
                media_type not in {"application/xhtml+xml", "text/html"}
                or "nav" in properties
                or filename_tokens & _EXCLUDED_FILE_TOKENS
            ):
                continue
            member_path = _safe_epub_path(opf_dir, href)
            chapter = _parse_xhtml_document(
                _archive_read(archive, member_path), member_path, len(chapters) + 1
            )
            if chapter is not None:
                chapters.append(chapter)

    if not chapters:
        raise NormalizationError("EPUB contains no readable prose chapters in its spine.")
    return _ParsedBook(
        title=title_values[0] if title_values else None,
        authors=authors,
        language=languages[0] if languages else None,
        chapters=tuple(chapters),
    )


def _parse_xhtml(source: LoadedSource) -> _ParsedBook:
    chapter = _parse_xhtml_document(source.data, source.name, 1)
    if chapter is None:
        raise NormalizationError("XHTML contains no readable prose paragraphs.")
    return _ParsedBook(title=chapter.title, authors=(), language=None, chapters=(chapter,))


def _parse_text(source: LoadedSource) -> _ParsedBook:
    try:
        text = source.data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise NormalizationError("Plain-text input must be UTF-8 encoded.") from exc
    text = unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n")
    raw_blocks = re.split(r"\n[\t ]*\n+", text)
    chapters: list[_RawChapter] = []
    current_title = "Chapter 1"
    current_blocks: list[str] = []

    def finish() -> None:
        nonlocal current_blocks
        if current_blocks:
            chapters.append(
                _RawChapter(
                    title=current_title,
                    locator=f"text:block-{len(chapters) + 1}",
                    paragraphs=tuple(current_blocks),
                )
            )
            current_blocks = []

    for raw_block in raw_blocks:
        lines = [line.strip() for line in raw_block.splitlines() if line.strip()]
        if not lines:
            continue
        compact = _clean_text(" ".join(lines))
        if len(lines) == 1 and _CHAPTER_HEADING.fullmatch(compact):
            finish()
            current_title = compact
        elif compact:
            current_blocks.append(compact)
    finish()
    if not chapters:
        raise NormalizationError("Plain-text input contains no readable paragraphs.")
    return _ParsedBook(title=None, authors=(), language=None, chapters=tuple(chapters))


def _sentence_spans(text: str) -> tuple[tuple[int, int], ...]:
    boundaries: list[int] = []
    for match in _SENTENCE_END.finditer(text):
        punctuation = match.group(0)
        if punctuation.startswith(".") and not punctuation.startswith(".."):
            prefix = text[: match.start() + 1]
            token_match = re.search(r"([A-Za-z]+)\.$", prefix)
            token = token_match.group(1) if token_match else ""
            if token.lower() in _ABBREVIATIONS or (len(token) == 1 and token.isupper()):
                continue
        boundaries.append(match.end())

    spans: list[tuple[int, int]] = []
    start = 0
    for end in [*boundaries, len(text)]:
        while start < end and text[start].isspace():
            start += 1
        trimmed_end = end
        while trimmed_end > start and text[trimmed_end - 1].isspace():
            trimmed_end -= 1
        if trimmed_end > start:
            spans.append((start, trimmed_end))
        start = end
    return tuple(spans)


def _build_document(
    source: LoadedSource,
    parsed: _ParsedBook,
    *,
    title: str | None,
    authors: tuple[str, ...] | None,
    language: str | None,
    slug: str | None,
    rights_status: str,
    rights_jurisdiction: str,
    rights_basis: str,
    source_provider: str,
    source_version: str | None,
) -> BookDocument:
    final_title = _clean_text(title or parsed.title or PurePosixPath(source.name).stem)
    final_authors = tuple(
        author for author in (_clean_text(value) for value in (authors or parsed.authors)) if author
    )
    if not final_authors:
        raise NormalizationError(
            "Book author metadata is required; pass --author when processing this source."
        )
    final_language = _clean_text(language or parsed.language or "") or None
    final_provider = _clean_text(source_provider)
    final_rights_status = _clean_text(rights_status)
    final_rights_jurisdiction = _clean_text(rights_jurisdiction)
    final_rights_basis = _clean_text(rights_basis)
    if not all(
        (final_provider, final_rights_status, final_rights_jurisdiction, final_rights_basis)
    ):
        raise NormalizationError("Source provider and rights provenance fields cannot be empty.")
    book_id = stable_uuid(
        "book", final_title.casefold(), *(author.casefold() for author in final_authors)
    )
    edition_id = stable_uuid("edition", source.sha256)
    chapters: list[Chapter] = []

    for chapter_ordinal, raw in enumerate(parsed.chapters, 1):
        paragraph_texts = tuple(
            value for value in (_clean_text(p) for p in raw.paragraphs) if value
        )
        if not paragraph_texts:
            continue
        chapter_text = "\n\n".join(paragraph_texts)
        chapter_hash = sha256_text(chapter_text)
        chapter_id = stable_uuid("chapter", edition_id, chapter_ordinal, raw.locator, chapter_hash)
        paragraphs: list[Paragraph] = []
        paragraph_start = 0
        sentence_ordinal = 0
        for paragraph_ordinal, paragraph_text in enumerate(paragraph_texts, 1):
            paragraph_end = paragraph_start + len(paragraph_text)
            paragraph_hash = sha256_text(paragraph_text)
            paragraph_id = stable_id("paragraph", chapter_id, paragraph_ordinal, paragraph_hash)
            sentences: list[Sentence] = []
            for local_start, local_end in _sentence_spans(paragraph_text):
                sentence_ordinal += 1
                sentence_text = paragraph_text[local_start:local_end]
                sentence_hash = sha256_text(sentence_text)
                sentences.append(
                    Sentence(
                        id=stable_id("sentence", paragraph_id, sentence_ordinal, sentence_hash),
                        ordinal=sentence_ordinal,
                        paragraph_id=paragraph_id,
                        paragraph_ordinal=paragraph_ordinal,
                        text=sentence_text,
                        start_offset=paragraph_start + local_start,
                        end_offset=paragraph_start + local_end,
                        content_sha256=sentence_hash,
                    )
                )
            paragraphs.append(
                Paragraph(
                    id=paragraph_id,
                    ordinal=paragraph_ordinal,
                    text=paragraph_text,
                    start_offset=paragraph_start,
                    end_offset=paragraph_end,
                    content_sha256=paragraph_hash,
                    sentences=tuple(sentences),
                )
            )
            paragraph_start = paragraph_end + 2
        chapters.append(
            Chapter(
                id=chapter_id,
                ordinal=chapter_ordinal,
                title=_clean_text(raw.title) or f"Chapter {chapter_ordinal}",
                locator=raw.locator,
                text=chapter_text,
                content_sha256=chapter_hash,
                paragraphs=tuple(paragraphs),
            )
        )
    if not chapters:
        raise NormalizationError("No readable chapters remained after normalization.")
    normalized_sha256 = sha256_text("\n\n\n".join(chapter.text for chapter in chapters))

    return BookDocument(
        id=book_id,
        edition_id=edition_id,
        slug=slugify(slug or final_title),
        title=final_title,
        authors=final_authors,
        language=final_language,
        normalized_sha256=normalized_sha256,
        source=SourceMetadata(
            provider=final_provider,
            file_name=source.name,
            kind=source.kind,
            sha256=source.sha256,
            media_type=source.media_type,
            url=source.source_url,
            download_url=source.download_url,
            version=_clean_text(source_version or "") or None,
            retrieved_at=source.retrieved_at,
            rights_status=final_rights_status,
            rights_jurisdiction=final_rights_jurisdiction,
            rights_basis=final_rights_basis,
        ),
        chapters=tuple(chapters),
    )


def normalize_source(
    source: LoadedSource,
    *,
    title: str | None = None,
    authors: tuple[str, ...] | None = None,
    language: str | None = None,
    slug: str | None = None,
    rights_status: str = "public-domain",
    rights_jurisdiction: str = "US",
    rights_basis: str = (
        "Public domain in the United States; verify rights in every deployment jurisdiction."
    ),
    source_provider: str = "Standard Ebooks",
    source_version: str | None = None,
) -> BookDocument:
    """Normalize a loaded source while preserving exact, stable source offsets."""

    if source.kind == "epub":
        parsed = _parse_epub(source)
    elif source.kind == "xhtml":
        parsed = _parse_xhtml(source)
    else:
        parsed = _parse_text(source)
    return _build_document(
        source,
        parsed,
        title=title,
        authors=authors,
        language=language,
        slug=slug,
        rights_status=rights_status,
        rights_jurisdiction=rights_jurisdiction,
        rights_basis=rights_basis,
        source_provider=source_provider,
        source_version=source_version,
    )
