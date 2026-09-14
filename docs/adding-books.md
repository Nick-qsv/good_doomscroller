# Adding a book

The ingestion pipeline is deliberately offline. A book is downloaded, parsed,
ranked, reviewed, and imported before the public web application can show it.
The web server does not fetch books or call a model during a reader request.

## 1. Review the rights and source

Choose a stable, reputable edition such as a Standard Ebooks EPUB and record:

- the canonical edition page and direct download URL;
- the exact title, author or authors, and language;
- the source provider and, when available, edition version;
- a public-domain status, jurisdiction, and written basis for that conclusion.

Do not infer that an edition is safe merely from the author's death date. The
underlying work, translation, introduction, annotations, typography, and
digital edition can have different rights. The pipeline preserves the supplied
rights claim and source digest, but it cannot make that legal determination.

Publication also requires the conservative review in [DATA_LICENSE.md](../DATA_LICENSE.md)
and [the September 2026 edition audit](legal/copyright-review-2026-09-13.md).
Review the entire preserved download, including introductions, translations,
illustrations and other substantive contributors. An author's original text
being public domain does not clear later material embedded in the same file.
Unresolved editions remain outside `corpus/published`.

The active edition ID, source URL, original SHA-256 and normalized SHA-256 must
match `apps/web/scripts/publication-policy.json` and the database approval
record. A `public-domain` label by itself cannot bypass this policy. Newly
reviewed editions require a documented policy update and a new migration;
do not edit an already-applied migration or remove a retirement marker to
republish a rejected source. Preserve and display the source provider's
required license notices before publication.

## 2. Set up the pipeline

From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e './pipeline[dev,openai]'
mkdir -p corpus/reviewed corpus/normalized
```

Those corpus working directories are ignored by Git because source books and
generated artifacts can be large and can carry edition-specific restrictions.
Only deliberately reviewed, appropriately licensed corpus data should ever be
added to version control.

## 3. Run the keyless first pass

Use a local EPUB path when possible so reruns do not depend on the network:

```sh
.venv/bin/good-doomscroll process path/to/book.epub \
  --selector heuristic \
  --source-url "https://standardebooks.org/ebooks/author/book" \
  --source-provider "Standard Ebooks" \
  --source-version "exact edition or release, if known" \
  --rights-status public-domain \
  --rights-jurisdiction US \
  --rights-basis "Why this work and this edition may be used" \
  --min-words 12 \
  --max-words 70 \
  --max-sentences 3 \
  --max-passages 100 \
  --output corpus/reviewed/book.json \
  --normalized-output corpus/normalized/book.json \
  --pretty
```

A direct HTTPS `.epub` URL also works as the positional source. Redirects are
followed and the final download URL, retrieval time, content type, original
SHA-256 digest, and normalized digest are recorded.

The normalized audit file contains the canonical chapters and sentences from
which every candidate was built. Stable UUIDv5 identifiers mean processing the
same source and metadata again produces the same book, edition, chapter, and
passage IDs.

## 4. Optionally rerank with a model

The heuristic output is sufficient to exercise the entire product. To use the
optional OpenAI selector, keep the key only in the local environment and rerun:

```sh
export OPENAI_API_KEY="your local project key"
.venv/bin/good-doomscroll process path/to/book.epub \
  --selector openai \
  --model gpt-5.4-mini \
  --source-url "https://standardebooks.org/ebooks/author/book" \
  --source-provider "Standard Ebooks" \
  --rights-status public-domain \
  --rights-jurisdiction US \
  --rights-basis "Why this work and this edition may be used" \
  --max-passages 100 \
  --output corpus/reviewed/book.json \
  --normalized-output corpus/normalized/book.json \
  --pretty
```

The model receives numbered candidate spans and returns structured candidate
IDs, scores, themes, flags, and short reasons. It is never trusted to reproduce
the quotation. Unknown IDs, duplicate IDs, altered source text, or invalid
offsets fail the run.

## 5. Review the result

Before publication, a human should inspect every selected passage for:

- exact attribution and a sensible chapter boundary;
- standalone readability and a useful length on mobile;
- OCR or transcription errors in the chosen edition;
- spoilers, slurs, graphic content, or other context-sensitive material;
- duplicate or near-duplicate selections;
- a credible rights record and working source URL.

The JSON must validate against `corpus/schemas/feed.schema.json`. The pipeline
test suite performs this check, and a one-off file can be checked with:

```sh
.venv/bin/python -c 'import json,sys; from jsonschema import validate; validate(json.load(open(sys.argv[1])), json.load(open("corpus/schemas/feed.schema.json")))' corpus/reviewed/book.json
```

## Optional AI context

A passage may include an `aiContext` object with `text`, `generatedBy: "AI"`,
and a `generatedAt` ISO timestamp with an explicit timezone. Keep the text to
one or two brief sentences (at most 600 Unicode characters), grounded in the
surrounding source. Identify character speech when relevant; do not turn a
character's view into an unsupported statement of the author's belief.

The reader sees "AI context" and "AI-generated interpretation; may be
inaccurate. Not part of the original quotation." Context is prepared offline,
stored separately from quote provenance, and excluded from exact-source
verification receipts and proof files. Reading the feed does not call a model.
Context-only edits preserve quote receipts. Omitting `aiContext` during an
authoritative reimport clears the previous explanation.

During the quality pass, prefer short readable sentences forming a complete
point from beginning to end. Reject dangling references, abrupt changes of
speaker, and arbitrary stretches of plot. Check the quotation and explanation
together against the surrounding source; word count alone is not an editorial
quality check.

## 6. Import and publish

Start PostgreSQL and the web app:

```sh
docker compose up --build
```

From another terminal, import a reviewed artifact. Without `--publish`, records
remain candidates and do not appear in the feed. Re-importing the same artifact
is safe and updates its metadata without creating duplicates.

```sh
DATABASE_URL=postgresql://doomscroller:doomscroller@localhost:5432/doomscroller \
  npm --prefix apps/web run corpus:import -- \
  --publish --replace-editions corpus/reviewed/book.json
```

Use `--replace-editions` only with `--publish`. It makes each supplied JSON file
authoritative for that edition: an older passage missing from the new artifact
is changed to `archived` and disappears from the feed. The import remains one
transaction, so a validation or database error leaves the previous edition
untouched.

Open <http://localhost:3000> and confirm the title, author, chapter, quote text,
source link, and reaction behavior. The API health response at
<http://localhost:3000/api/health> should report database mode.

Place approved feed JSON in `corpus/published/` to include it when running the
container. Keep source files and review notes with the contribution so another
contributor can reproduce the checks.

To retire a whole edition, read its `book.editionId`, remove its published JSON,
and add an empty marker named for that UUID:

```sh
touch corpus/retired/<edition-uuid>.retired
```

Commit both changes and deploy the new image. Startup applies retirements after
all imports, archiving every passage while retaining the edition and its audit
metadata. A nonempty or incorrectly named marker fails startup. To restore the
edition, remove the marker, restore its reviewed JSON, and rebuild. A
valid-looking marker for an edition that is not already in the database also
fails startup, preventing a mistyped UUID from looking like
a successful retirement.
