# Source-to-quote verification

The pilot proves a specific, reproducible relationship: the displayed quote is an exact slice of text produced by normalizing a preserved source file. It also keeps a history of the import/publication facts recorded by this application.

It does **not** independently authenticate the publisher, uploader, selector, clock, or reviewer. A file and a matching hash can both be fabricated. Someone assessing authenticity should compare the preserved file with an independently obtained publisher edition. Human review is `not-recorded`, and blockchain anchoring is `not-anchored`.

## What is preserved and checked

1. The pipeline reads the original EPUB, XHTML, or UTF-8 text bytes and hashes those literal bytes with SHA-256. The feed's verification bundle includes them as base64, alongside every normalized chapter.
2. Normalization version `1` uses the checked-in pipeline: Unicode NFC, the documented text/HTML parsing rules, paragraph whitespace handling, and chapter/sentence addressing. HTML markup and layout are not part of the normalized quote. The unchanged original remains downloadable.
3. Before importing anything into PostgreSQL, the importer launches the local Python verifier. It hashes the archived bytes, repeats normalization, compares all normalized chapter and sentence records, and reconstructs every selected passage from its sentence IDs and offsets. Replacing a quote and merely recomputing its hash is rejected.
4. PostgreSQL stores one original-byte and normalized-source snapshot per edition. Each changed import or publication stores the exact JSON receipt, its SHA-256 fingerprint, and the previous receipt fingerprint for that passage. The transaction includes the passage and receipt together.
5. The public verification page rechecks the current passage against the latest publication receipt and the preserved normalized chapter. Proof/source downloads additionally hash the original bytes; proof downloads check every supplied receipt link.

Offsets are **zero-based Unicode code points within the normalized chapter**, with an inclusive start and exclusive end. They are not UTF-8 byte offsets or JavaScript UTF-16 indices. A chapter's fingerprint hashes its UTF-8 text. The complete normalized-source fingerprint hashes chapter texts in stored order joined by exactly three newline characters (`\n\n\n`).

Receipts hash the UTF-8 bytes of the exact `receiptJson` string. Do not pretty-print or reserialize that string before hashing. The separately parsed `receipt` object is a convenience for readers.

## Verify without trusting the website's success label

From a passage's **Verify quote** page, download its proof JSON and original source file. Python 3.11+ and this repository are sufficient; verification uses the standard library, reads local files, and makes no network or AI requests.

Run from the repository root:

```sh
PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline verify-proof /path/to/passage-proof.json /path/to/passage-source.bin
```

This repeats original-file normalization, checks the entire normalized source, reconstructs the exact quote from sentence IDs and offsets, and validates the receipt fingerprint and supplied history. It explicitly reports that publisher/operator identities and timestamps are not authenticated. Save downloaded proofs independently if you want to compare later versions.

To verify a complete pipeline export before import:

```sh
PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline verify corpus/published/pride-and-prejudice.json
```

The book's canonical source and direct download address are public metadata. The importer rejects non-HTTP(S) URLs, embedded credentials, query strings, fragments, and local directories in source file names. If a private download is needed, archive it locally and supply the canonical public source address; do not publish private or signed URLs.

## Publication and history behavior

- `retrievedAt` is the pipeline's reported acquisition time. `checkedAt` and `recordedAt` use the application host's clock. These are operator-controlled timestamps, not independently attested times.
- Selection method, model (if any), and reason are recorded metadata. They are not a signed audit of a remote model call. Assistant screening does not establish a human review signature.
- A container restart reruns source verification and imports the same shipped corpus. When passage status and receipt facts are unchanged, it retains the existing receipt and publication time instead of inventing a new publication event.
- A changed source acquisition record, selection explanation, or publication state produces a new receipt linked to the prior one. Existing book/edition identities remain bound to the pipeline's identity rules; attribution corrections need a deliberate migration rather than relabeling preserved records. Ordinary source/receipt updates, deletes, and truncation are rejected by database triggers.
- Retirement and omitted-passage archival hide passages while retaining source snapshots and receipts. Those legacy archival operations do not yet produce public signed or hash-linked retirement events. The public endpoints serve only currently published passages.
- No uploader wallet, human reviewer signature, or external identity has been recorded. The public proof contains source, selection, and publication metadata rather than application actor identities or credentials.

AI context is a separately labeled interpretation. It is excluded from quote
receipts and proof files, and changing an explanation does not change the
quotation's verification history.

## Trust boundary and later Polkadot work

The database and application are still controlled by the operator. A database owner can change schema protections, replace data, or restore a different history. Without an independently saved receipt or trusted external commitment, a reader cannot detect a complete replacement of the history. Database triggers are protection against ordinary mutation, not a promise that records are hacker-proof.

An eventual Polkadot integration can commit receipt fingerprints (or a batch Merkle root) and expose the transaction and inclusion proof. That can establish that committed data existed by a point in chain history. It will not, by itself, establish that an attributed book is authentic or that a claimed person performed a review. Website publication and reading currently work without any blockchain transaction.
