"""Load a local file or a direct HTTPS ebook download."""

from __future__ import annotations

import mimetypes
import urllib.parse
import urllib.request
import zipfile
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path

from .ids import sha256_bytes
from .models import LoadedSource, SourceKind

MAX_SOURCE_BYTES = 100 * 1024 * 1024
USER_AGENT = "good-doomscroller-pipeline/0.1 (+https://github.com/Nick-qsv/good_doomscroller)"


class SourceError(ValueError):
    """Raised when an input cannot safely be interpreted as a supported source."""


def _read_https(url: str) -> tuple[bytes, str, str | None]:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https":
        raise SourceError("Remote sources must use HTTPS. Paste the direct .epub download URL.")

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:  # noqa: S310 - HTTPS checked
            final_url = response.geturl()
            if urllib.parse.urlparse(final_url).scheme != "https":
                raise SourceError("Remote source redirected away from HTTPS.")
            declared_length = response.headers.get("Content-Length")
            if declared_length and int(declared_length) > MAX_SOURCE_BYTES:
                raise SourceError("Source is larger than the 100 MiB download limit.")
            data = response.read(MAX_SOURCE_BYTES + 1)
            if len(data) > MAX_SOURCE_BYTES:
                raise SourceError("Source is larger than the 100 MiB download limit.")
            return data, final_url, response.headers.get_content_type()
    except SourceError:
        raise
    except Exception as exc:
        raise SourceError(f"Could not download source: {exc}") from exc


def _detect_kind(name: str, data: bytes, media_type: str | None) -> SourceKind:
    suffix = Path(urllib.parse.urlparse(name).path).suffix.lower()
    if suffix == ".epub" or media_type == "application/epub+zip":
        return "epub"
    if data.startswith(b"PK"):
        try:
            with zipfile.ZipFile(BytesIO(data)) as archive:
                if "META-INF/container.xml" in archive.namelist():
                    return "epub"
        except zipfile.BadZipFile:
            pass
    if suffix in {".xhtml", ".html", ".htm"} or media_type in {
        "application/xhtml+xml",
        "text/html",
    }:
        return "xhtml"
    if suffix in {".txt", ".text"} or (media_type and media_type.startswith("text/plain")):
        return "text"
    if data.lstrip().startswith((b"<?xml", b"<!DOCTYPE html", b"<html")):
        return "xhtml"
    return "text"


def load_source(reference: str | Path, *, source_url: str | None = None) -> LoadedSource:
    """Load EPUB, XHTML, or UTF-8 text from disk or a direct HTTPS URL.

    Standard Ebooks publication-page discovery is intentionally not guessed. For remote
    inputs, provide the direct ``.epub`` download URL shown on the book's download page.
    """

    value = str(reference)
    retrieved_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme in {"http", "https"}:
        data, final_url, response_type = _read_https(value)
        name = Path(urllib.parse.urlparse(final_url).path).name or "download"
        kind = _detect_kind(final_url, data, response_type)
        media_type = response_type or _media_type_for(kind)
        loaded = LoadedSource(
            data=data,
            name=name,
            kind=kind,
            sha256=sha256_bytes(data),
            source_url=source_url or final_url,
            download_url=final_url,
            retrieved_at=retrieved_at,
            media_type=media_type,
        )
        return loaded
    if parsed.scheme:
        raise SourceError(
            f"Unsupported source scheme {parsed.scheme!r}; use a local path or HTTPS."
        )

    path = Path(value).expanduser()
    if not path.is_file():
        raise SourceError(f"Source file does not exist: {path}")
    if path.stat().st_size > MAX_SOURCE_BYTES:
        raise SourceError("Source is larger than the 100 MiB input limit.")
    data = path.read_bytes()
    guessed_type, _ = mimetypes.guess_type(path.name)
    kind = _detect_kind(path.name, data, guessed_type)
    return LoadedSource(
        data=data,
        name=path.name,
        kind=kind,
        sha256=sha256_bytes(data),
        source_url=source_url,
        download_url=None,
        retrieved_at=retrieved_at,
        media_type=guessed_type or _media_type_for(kind),
    )


def _media_type_for(kind: SourceKind) -> str:
    return {
        "epub": "application/epub+zip",
        "xhtml": "application/xhtml+xml",
        "text": "text/plain",
    }[kind]
