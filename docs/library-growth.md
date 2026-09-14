# Growing the quotation library

An endless feed needs both a growing supply of reviewed quotations and a reader
history that serves unseen quotations first. Shuffling a small library cannot
create new material. After a reader has seen every eligible quotation, the feed
must revisit older ones until more reviewed material is published; it should
make that transition clear.

The prepared science-expansion release contains **265 reviewed quotes from 14
books**. It preserves the 205-passage live baseline and adds 60 passages from
four already-approved exact editions: Darwin, Faraday, Somerville, and
Cavendish. The historical candidate queues below are not themselves approved
publication artifacts. Live deployment and blockchain finalization are tracked
separately.

## Initial supply and review queue

An offline inventory of the working corpus on September 12, 2026 verified
**213 distinct published quotation texts across seven source editions**. This is the baseline used to prepare the two queues below, before the seven
requested books were added.

The new queue command found this additional candidate supply, after excluding
published passages and overlapping source spans. Defaults are 18–65 words,
at most three sentences, and heuristic score at least 80. Only source sections
already represented by a published selection are considered.

| Preserved edition | Published passages | Eligible candidate windows | Non-overlapping candidate capacity |
| --- | ---: | ---: | ---: |
| A Vindication of the Rights of Woman | 30 | 1,354 | 921 |
| Essays by Ralph Waldo Emerson | 31 | 1,647 | 763 |
| Frankenstein, 1818 | 30 | 1,401 | 669 |
| Meditations, George Long translation | 31 | 2,150 | 935 |
| Narrative of the Life of Frederick Douglass | 31 | 1,019 | 503 |
| Pride and Prejudice | 30 | 1,205 | 539 |
| The Souls of Black Folk | 30 | 1,011 | 607 |
| **Total** | **213** | **9,787** | **4,937** |

Candidate windows include alternative lengths of the same passage; they must
not be counted as separate finished quotations. The final column counts one
feasible set of source spans that do not overlap. **Neither candidate count is
an approval or a forecast of how many will pass editorial review.** A high
heuristic score cannot establish that a passage is insightful, self-contained,
free of editorial material, or attributed to the correct speaker.

Two historical prepared batches contain **280 candidate windows**, 20 from each
edition in each batch, in `corpus/work/library-growth/batch-001.json` and
`batch-002.json`. They began as review-required working files and are ignored by
Git. The September 13 additive review selected some windows and revised others;
the remaining queue rows are not approved. Only the separately verified complete
edition bundles in the published corpus can change the live library.

## Prepare another batch

From the repository root, using Python 3.11 or newer:

```sh
PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline.library_queue \
  --published-dir corpus/published \
  --per-book 20 \
  --output corpus/work/library-growth/batch-001.json
```

Use a new output name for each batch. The command refuses to overwrite an
existing review file or write inside the published corpus directory. If the
first batch already exists, preserve it and prepare the next batch with
(use `batch-003.json` and exclude both prior files if both already exist):

```sh
PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline.library_queue \
  --published-dir corpus/published \
  --per-book 20 \
  --exclude-queue corpus/work/library-growth/batch-001.json \
  --output corpus/work/library-growth/batch-002.json
```

Repeat `--exclude-queue` for every earlier batch, including rejected selections,
so later batches do not recycle the same spans. Historical queue quotations are
verified against the preserved edition before being used for exclusions. Use
the same input editions when excluding prior queues.

Each run reproduces normalization from the original source bytes and verifies
every input bundle. It preserves source and chapter hashes, exact Unicode
offsets, sentence IDs, original quotation text, attribution, and the existing
rights record. Case, whitespace and typography are normalized only for the
duplicate check; displayed quotation text is never rewritten. Published spans,
prior queued spans, and overlapping new selections are excluded. Duplicate
word sequences are excluded across editions in the batch, but paraphrases and
other near duplicates still need review.

The JSON includes up to 600 characters before and after each candidate, along
with heuristic theme and content-flag suggestions. These excerpts can start
the review; the preserved full source and [edition notes](../corpus/published/notes/)
remain necessary when the thought, speaker, or printed chapter is unclear.
The command performs no downloads, model calls, database writes, or publication.

## Review and publish

For each row, inspect the exact text and its surrounding source, then record
`reviewStatus` as `accepted` or `rejected` and explain the decision in
`reviewNotes`. Leave uncertain rows `required`. These fields are review notes;
the queue command does not interpret an accepted status as permission to publish.

Check that the passage forms a complete thought, stands alone on mobile, is
attributed to its actual speaker, and contains no source notices or editor's
commentary mistaken for the author's writing. Check transcription errors,
sensitive content, misleading omissions, and near duplicates. Some preserved
source sections merge several printed chapters, so membership in an already
used section is only a first filter.

Once selections have been reviewed, use their exact `Candidate` fields with
the existing `export_feed` pipeline to build a candidate feed from the same
preserved source. Keep the existing published passages when expanding an
edition; a partial batch must never be used as an authoritative replacement
for the complete edition. Preserve original offsets and quotation text. Keep
any AI explanation separate from source quotation data. Verify the complete
feed and follow [Adding a book](adding-books.md) for schema checks, import, and
publication. The review queue deliberately lacks the feed's `passages` and
`verificationBundle` contract, so it cannot be imported as a publication bundle.

## A practical growth target

Use **3,000 reviewed quotations from at least 30 diverse books** as an initial
editorial target, not a claim about current inventory. At 30 unseen quotations
per day, 3,000 gives one reader roughly 100 days before exhausting the full
library; filters and prior reading can shorten that. Measure acceptance rate
from several review batches before estimating the work needed to reach it.

Expand existing editions in small reviewed batches while adding
new sources with varied authors, traditions, genres, subjects, and publication
periods. Review the actual edition and its rights record using the existing
adding-books procedure before inclusion; a new translation or introduction
can require a different assessment. The queue preserves the current US rights
records and does not make a new claim for other jurisdictions.

Track published distinct texts, represented authors/books, review acceptance
rate, per-reader unseen supply, and the point where readers exhaust it. These
show whether more books or better selections are needed, and prevent a large
count of overlapping candidate windows from being mistaken for a healthy
library.
