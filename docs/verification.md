# Source-to-quote verification

## Start here: the plain-English version

We save the book, choose a passage, and record a short reason. When we compare alternatives during selection, that comparison is saved too. New exports record when the notes were written; older passages receive no invented selection date.

A receipt holds those details. The readable-text transaction format includes public selection rationales alongside a shared fingerprint of the receipts; the legacy format contains only the fingerprint. An independent chain check establishes what was recorded by that block; it does not prove the quote is true or the choice was good.

As of the September 13, 2026 book release, the website can verify both formats,
but the deployed anchoring worker still writes the legacy format. The readable
text release is prepared with an approved one-time fee ceiling of 1.28 DOT,
above the normal 0.005 DOT limit. Deployment and finalization are pending. No readable-text transaction has been
broadcast as part of this release.

Open **Verify quote** to read the reason and download the book and proof. The [reader guide](/how-it-works) has the short version; the independent checks are below.

## Technical scope

The pilot proves a specific, reproducible relationship: the displayed quote is an exact slice of text produced by normalizing a preserved source file. It also keeps a history of the import/publication facts recorded by this application.

It does **not** independently authenticate the publisher, uploader, selector, clock, or reviewer. A file and a matching hash can both be fabricated. Someone assessing authenticity should compare the preserved file with an independently obtained publisher edition. Human review is `not-recorded`. Polkadot anchoring is reported separately for every supplied history receipt as either finalized or pending.

## What is preserved and checked

1. The pipeline reads the original EPUB, XHTML, or UTF-8 text bytes and hashes those literal bytes with SHA-256. The feed's verification bundle includes them as base64, alongside every normalized chapter.
2. Normalization version `1` uses the checked-in pipeline: Unicode NFC, the documented text/HTML parsing rules, paragraph whitespace handling, and chapter/sentence addressing. HTML markup and layout are not part of the normalized quote. The unchanged original remains downloadable.
3. Before importing anything into PostgreSQL, the importer launches the local Python verifier. It hashes the archived bytes, repeats normalization, compares all normalized chapter and sentence records, and reconstructs every selected passage from its sentence IDs and offsets. Replacing a quote and merely recomputing its hash is rejected.
4. PostgreSQL stores one original-byte and normalized-source snapshot per edition. Each changed import or publication stores the exact JSON receipt, its SHA-256 fingerprint, and the previous receipt fingerprint for that passage. The transaction includes the passage and receipt together.
5. The public verification page rechecks the current passage against the latest publication receipt and the preserved normalized chapter, then validates every supplied history receipt and any finalized inclusion proofs. Proof/source downloads additionally hash the original bytes.
6. An isolated worker batches unanchored receipt fingerprints, persists the exact batch and transaction before broadcast, and records a Polkadot Hub anchor only after successful finalized inclusion. The prepared readable-text worker also includes their recorded public selection rationales. The web app reads this public evidence and never receives the wallet key. Publication and source verification remain separate from the daily blockchain batch.

Offsets are **zero-based Unicode code points within the normalized chapter**, with an inclusive start and exclusive end. They are not UTF-8 byte offsets or JavaScript UTF-16 indices. A chapter's fingerprint hashes its UTF-8 text. The complete normalized-source fingerprint hashes chapter texts in stored order joined by exactly three newline characters (`\n\n\n`).

Receipts hash the UTF-8 bytes of the exact `receiptJson` string. Do not pretty-print or reserialize that string before hashing. The separately parsed `receipt` object is a convenience for readers.

## Verify without trusting the website's success label

From a passage's **Verify quote** page, download its proof JSON and original source file. Python 3.11+ and this repository are sufficient; verification uses the standard library, reads local files, and makes no network or AI requests.

Run from the repository root:

```sh
PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline verify-proof /path/to/passage-proof.json /path/to/passage-source.bin
```

This repeats original-file normalization, checks the entire normalized source, reconstructs the exact quote from sentence IDs and offsets, and validates the receipt fingerprint and supplied history. This Python command does **not** independently query Polkadot or authenticate chain finality. Save downloaded proofs independently if you want to compare later versions. Blockchain verification is an additional check described below.

For the second, independent check, install the pinned public chain reader dependencies with `npm ci --prefix packages/anchoring`, then run:

```sh
node packages/anchoring/verify-proof.mjs /path/to/passage-proof.json --rpc wss://asset-hub-polkadot-rpc.n.dwellir.com
```

Use an independently chosen trusted Polkadot Hub RPC node; omit `--rpc` to use the configured public endpoints. This command reads public chain data and local proof bytes without accessing a wallet, database, or secret. It rechecks all receipt hashes and history links, matches every supplied receipt to its inclusion proof or pending status, rebuilds each envelope, and checks the exact transaction, successful dispatch, remarked event and block timestamp against a canonical finalized chain view. It exits `0` only when every supplied receipt is anchored and the chain checks pass, `2` when valid supplied history still has pending receipts, and `1` for invalid evidence or a failed chain check.

This is RPC-based verification, not a GRANDPA light-client finality proof: the RPC node supplies the chain view. The result reports the freshly observed finalized head; the older `finalizedHeadHash` in the download is operator-recorded metadata. A passage proof may omit unrelated intervening batches, so the verifier separately reports `predecessors-not-supplied` when it cannot check all prior global batch links. Its receipt-inclusion result does not claim complete global history or independently authenticate the manifest's database sequence metadata.

To verify a complete pipeline export before import:

```sh
PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline verify corpus/published/pride-and-prejudice.json
```

The book's canonical source and direct download address are public metadata. The importer rejects non-HTTP(S) URLs, embedded credentials, query strings, fragments, and local directories in source file names. If a private download is needed, archive it locally and supply the canonical public source address; do not publish private or signed URLs.

## Publication and history behavior

- `retrievedAt` is the pipeline's reported acquisition time. `checkedAt` and `recordedAt` use the application host's clock. These are operator-controlled timestamps, not independently attested times.
- Selection method, model (if any), and reason are recorded metadata. They are not a signed audit of a remote model call. Assistant screening does not establish a human review signature.
- `selectionRecordedAt` records when the pipeline wrote the selection notes, using its own clock; it is not independently authenticated decision time. `selection-comparison` marks an alternative compared during a new selection. Older `retrospective-comparison` entries remain in append-only history but are not displayed as forward selection evidence. Both types validate alternative text against the preserved source.
- A container restart reruns source verification and imports the same shipped corpus. When passage status and receipt facts are unchanged, it retains the existing receipt and publication time instead of inventing a new publication event.
- A changed source acquisition record, selection explanation, or publication state produces a new receipt linked to the prior one. Existing book/edition identities remain bound to the pipeline's identity rules; attribution corrections need a deliberate migration rather than relabeling preserved records. Ordinary source/receipt updates, deletes, and truncation are rejected by database triggers.
- Retirement and omitted-passage archival hide passages while retaining source snapshots and receipts. Those legacy archival operations do not yet produce public signed or hash-linked retirement events. The public endpoints serve only currently published passages.
- No uploader wallet, human reviewer signature, or external identity has been recorded. The public proof contains source, selection, and publication metadata rather than application actor identities or credentials.

AI context is hidden in the feed until the reader clicks or keyboard-activates
the quotation. It is a separately labeled interpretation. It is excluded from quote
receipts and proof files, and changing an explanation does not change the
quotation's verification history.

## Polkadot commitments and inclusion proofs

The proof download retains the exact original `receiptJson` and complete supplied `history`. Its separate `anchoring` object contains:

- `history`: one entry per supplied receipt, identified by its decimal PostgreSQL sequence and SHA-256. Each entry is explicitly `pending` or includes its `batchId` and `inclusionProof`.
- `batches`: the finalized batches used by those inclusion proofs. Each contains the exact binary envelope, root, previous batch/root, receipt count, named chain and signer, block hash/number/timestamp, extrinsic hash/index, remarked event index, and the finalized head recorded by the worker.
- `totalReceipts`, `finalizedReceipts`, and `pendingReceipts`: the page reports partial coverage if any earlier or current receipt is still pending. An anchor on the latest receipt alone does not label the whole supplied history anchored.

Original receipt JSON is append-only. Its original `anchor.status: "not-anchored"` describes the receipt at creation and is not rewritten after anchoring; consult the separate anchoring evidence.

The chain is **Polkadot Hub / Asset Hub mainnet**, genesis hash `0x68d56f15f85d3136970ec16946040bc1752654e906147f7e43e9d539d7c3de2f`. The signer is `12wmbcz2PqfsLdJHhpn12bbkR1Az1ydkEsoJDxkSjCm8Ue59`. An address alone does not identify a chain.

The deterministic format, implemented in `packages/anchoring/proofs.mjs`, is:

1. Order receipts by their positive `BIGINT` sequence using integer comparison, never lexical sorting or floating-point conversion. A manifest lists each decimal sequence and receipt fingerprint, in that order.
2. For each receipt, hash the exact UTF-8 bytes of `receiptJson`. Hash its 32 fingerprint bytes with a leading byte `0x00` to produce the Merkle leaf.
3. Hash `0x01 || left32 || right32` for each parent. If a level has an odd last node, duplicate that node. A one-receipt tree has that single leaf as its root. Each inclusion proof specifies its zero-based leaf index, total leaf count, and ordered sibling hashes/directions.
4. The legacy format is exactly 92 bytes: ASCII `GDSANCH1` (8 bytes), batch UUID (16 bytes), receipt count (unsigned 32-bit big endian), root (32 bytes), previous root (32 bytes; all zero for the first batch). The readable-text format uses `GDSANCH2` with the same header fields, followed by a four-byte unsigned big-endian JSON byte length and the actual UTF-8 JSON rationale array. Both use `system.remarkWithEvent`. The explicit count prevents ambiguity from odd-node duplication.

Each rationale entry has the fixed property order `receiptSha256`, `passageId`, `selection`; selection contains `reason` and, only when present in the exact receipt, `selectionRecordedAt`. Entries follow Merkle leaf order. The rationale is a concise public editorial explanation, not a hidden chain-of-thought transcript. The worker copies the recorded reason without truncation, rewriting, or invented timestamps. Separate AI context and longer comparison metadata remain in their existing locations.

The version 2 parser rejects noncanonical JSON, malformed UTF-8, incorrect byte lengths, reordered receipt hashes, duplicate entries, extra fields and payloads exceeding 128 KiB. Web and independent proof checks compare each included rationale with the selection fields of the exact hash-checked receipt. The independent verifier also compares these bytes with the transaction on the named chain. Readable reasons are therefore available from the transaction itself, even if the website disappears; the hash alone does not reconstruct the rest of a receipt or the original source.

The worker reduces a new batch to fit the configured payload and existing fee limits before persisting it. The limits remain 0.005 DOT per transaction, three prepared attempts per UTC day, a 2 DOT rolling annual allowance and a 1 DOT operating reserve. A backlog may require multiple runs. Existing finalized or pending version 1 batches keep their original bytes and recovery behavior; no older record is relabeled as containing rationale text.

The manifest uses exact `JSON.stringify` property order: `schemaVersion`, `batchId`, `previousBatchId`, `previousRootSha256`, `receipts`; each receipt has `sequence`, `receiptSha256`. The chain envelope commits the count and Merkle root, not the manifest JSON serialization or database sequence numbers. The sequence list is ordering metadata; receipt bytes themselves are protected by the root.

To independently authenticate blockchain evidence, obtain a trusted finalized view of the named chain, confirm the supplied block is finalized, and inspect the extrinsic at its supplied index. Check its hash, signer, exact `system.remarkWithEvent` bytes, successful dispatch and matching `system.Remarked` event for that same extrinsic. Rebuild the envelope from the downloaded batch fields and check every receipt's Merkle proof against that root. Match the previous root against the preceding chain commitment when inspecting batch continuity. The page links to the corresponding explorer record as a convenient inspection aid; an explorer link or downloaded JSON by itself is not a cryptographic finality proof.

## Trust boundary

The database and application are still controlled by the operator. A database owner can change schema protections, replace data, or restore a different history. Database triggers protect against ordinary mutation. The page recomputes local hashes and inclusion proofs against stored finalized evidence; authenticating that evidence requires an independent chain check. Keep independent receipts and chain records if you want to detect the website later omitting an older commitment or presenting another history.

A checked Polkadot commitment establishes that the supplied receipt bytes existed by the anchor block. The first backfill cannot independently prove earlier publication or acquisition dates recorded inside those receipts. Anchors do not prove source authenticity, human review, completeness of logged events, or that the website is showing the newest commitment. Website publication and reading do not wait for a blockchain transaction; new receipts remain clearly pending until finalized evidence is recorded.
