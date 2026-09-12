# Published pilot library

The pilot contains seven source editions and 210 passages, with 30 passages per
book. Each JSON preserves the original downloaded file, the full normalized
document, and the exact locations used for its quotations. Startup verifies
every bundle before publishing it in one database transaction.

| Book | Edition | Source | Bundle |
| --- | --- | --- | --- |
| Pride and Prejudice | Jane Austen | [Gutenberg 1342](https://www.gutenberg.org/ebooks/1342) | `pride-and-prejudice.json` |
| Meditations | Marcus Aurelius, George Long translation | [Gutenberg 15877](https://www.gutenberg.org/ebooks/15877) | `meditations-george-long.json` |
| Narrative of the Life of Frederick Douglass | 1845 narrative | [Gutenberg 23](https://www.gutenberg.org/ebooks/23) | `narrative-of-frederick-douglass.json` |
| Frankenstein | Mary Shelley, 1818 edition | [Gutenberg 41445](https://www.gutenberg.org/ebooks/41445) | `frankenstein-1818.json` |
| The Souls of Black Folk | W. E. B. Du Bois | [Gutenberg 408](https://www.gutenberg.org/ebooks/408) | `the-souls-of-black-folk.json` |
| A Vindication of the Rights of Woman | Mary Wollstonecraft | [Gutenberg 3420](https://www.gutenberg.org/ebooks/3420) | `a-vindication-of-the-rights-of-woman.json` |
| Essays | Ralph Waldo Emerson | [Gutenberg 16643](https://www.gutenberg.org/ebooks/16643) | `essays-emerson.json` |

The expanded selections were screened by the assistant and independently
reviewed by a second assistant for attribution, surrounding context, complete
thoughts, and overlap. Short, coherent observations take priority over arbitrary
plot windows. Weaker ranges from the earlier 84-passage library were replaced,
including all twelve original automatically selected Austen passages.

Every passage has a brief, precomputed explanation labeled **AI context** with
an explicit statement that it may be inaccurate and is not part of the original
quotation. The explanations are checked against surrounding source text and
kept outside exact-quotation proofs. They are interpretations, not source text.

Selections exclude publisher notices, editorial introductions, and annotations.
Curation reasons and [edition notes](notes/) record printed locations when
needed. Original files and normalized documents are unchanged. No human
editorial signature or blockchain anchor is claimed.

The catalogue records identify these editions as public domain in the USA.
That is the jurisdiction recorded in each bundle; it is not a worldwide rights
claim. Preserving an edition and checking its text does not independently
authenticate its publisher or the truth of a quotation's claims.

The text normalizer can group multiple printed chapters into one source
section when headings are not recognized. The reader interface labels its
generic fallback as a source section, and selection notes supply printed
references. Full source sections are retained for reproducibility.

To check every bundle locally:

```sh
for feed in corpus/published/*.json; do
  PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline verify "$feed"
done
```

## Preserved Austen source

`pride-and-prejudice.json` contains the preserved source and 30 reviewed passages from Jane Austen's *Pride and Prejudice*. The original 12 automatic selections have been replaced; the archived source is unchanged.

The original file came from [Project Gutenberg's direct UTF-8 download](https://www.gutenberg.org/cache/epub/1342/pg1342.txt). The [official catalogue record for ebook 1342](https://www.gutenberg.org/ebooks/1342) identifies Jane Austen as the author, lists the work as public domain in the USA, and reported a last update of September 1, 2026 when checked on September 10, 2026. The original file, including its Gutenberg notices, is preserved unchanged in the bundle and the database.

| Artifact | Value |
| --- | --- |
| Original file | `pg1342.txt`, 772,386 bytes |
| Reported retrieval time | `2026-09-10T22:21:01.314074Z` |
| Original SHA-256 | `3f6bb9d6f78e0293b56acd4714dd68cb7d6d1d293402031ce9d5a216bcaf9d75` |
| Normalized-source SHA-256 | `ba93ca2be1d530719c8670bd9deab899d8c72df50fb6af25c1f7eb26ad2ee0c1` |
| Current bundle SHA-256 | `f2e4af341c131a8ba0f3c3600a8e69fbca52249457244919bf34630a0e512c75` |
| Pipeline / normalization | `0.2.0` / `1` |
| Current selection | 30 assistant-reviewed passages, 18–65 words |

All 62 normalized source sections remain in the bundle, including the section
preceding Chapter I and the end material. Selected passages come from the
novel's body, not the Gutenberg introduction or license. Source section
ordinals include the initial section, so an ordinal is not necessarily the
novel's printed chapter number.

To reproduce the offline source check from the repository root:

```sh
PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline verify corpus/published/pride-and-prejudice.json
```

See [the verification procedure and trust limits](../../docs/verification.md) for checking a downloaded public receipt and original file independently. Keep new books as candidates until their source bundle, publication rights, selection quality, and public metadata have been evaluated for the intended launch.
