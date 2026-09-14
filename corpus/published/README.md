# Published library

The conservative rights review of 13 September 2026 retains **8 exact source editions and 157 passages**; the subsequent older-candidate review adds **3 editions and 24 passages**, and the following Astell/Cavendish/Somerville review adds **3 editions and 24 passages**. The science expansion adds **60 passages** to four already-approved exact editions, for **14 editions and 265 passages**. Eighteen other editions were removed from this packaged publication directory. Removal is an operational choice under the user's strict reuse policy, not a finding that those books are unlawful to use in the United States.

The [edition audit A](../../docs/legal/rights-audit-a-2026-09-13.md) and [edition audit B](../../docs/legal/rights-audit-b-2026-09-13.md) explain the evidence and exclusions. The [pinned publication policy](../../apps/web/scripts/publication-policy.json) fixes each permitted book ID, edition ID, source URL, original SHA-256 and normalized SHA-256. A new edition or changed source needs a new review; a U.S. public-domain label alone cannot authorize publication.

| Book | Source | Passages |
| --- | --- | --- |
| The Autobiography of Charles Darwin | [Exact source](https://www.gutenberg.org/ebooks/2010) | 30 |
| The Chemical History of a Candle | [Exact source](https://www.gutenberg.org/ebooks/14474) | 30 |
| Frankenstein; Or, The Modern Prometheus (1818) | [Exact source](https://www.gutenberg.org/ebooks/41445) | 33 |
| Incidents in the Life of a Slave Girl, Written by Herself | [Exact source](https://www.gutenberg.org/ebooks/11030) | 15 |
| The Letters of Charles Dickens. Vol. 1, 1833-1856 | [Exact source](https://www.gutenberg.org/ebooks/25852) | 15 |
| Life of Mozart | [Exact source](https://www.gutenberg.org/ebooks/67828) | 15 |
| Narrative of the Life of Frederick Douglass, an American Slave | [Exact source](https://www.gutenberg.org/ebooks/23) | 34 |
| The Tao Teh King, or the Tao and its Characteristics | [Exact source](https://www.gutenberg.org/ebooks/216) | 15 |
| Common Sense (1776) | [Exact source](https://www.gutenberg.org/ebooks/147) | 8 |
| The Theory of Moral Sentiments (1777) | [Exact source](https://www.gutenberg.org/ebooks/67363) | 8 |
| The Interesting Narrative of the Life of Olaudah Equiano (1789) | [Exact source](https://www.gutenberg.org/ebooks/15399) | 8 |
| A Serious Proposal to the Ladies (1697) | [Exact source](https://www.gutenberg.org/ebooks/54984) | 8 |
| The Description of a New World, Called the Blazing-World (1668) | [Exact source](https://www.gutenberg.org/ebooks/51783) | 20 |
| On the Connexion of the Physical Sciences (1858) | [Exact source](https://www.gutenberg.org/ebooks/52869) | 26 |

Each retained JSON preserves the original downloaded file, complete normalized text and exact quotation locations. Gutenberg notices remain attached. The separate AI interpretations may be inaccurate and are outside quotation verification. Existing edition notes document assistant selection; no human editorial signature is claimed.

The underlying books have strong historical public-domain evidence, but this is not universal clearance of copyright, moral rights, trademarks or every local law. Gutenberg's U.S. status and distribution license remain separately relevant.

## Enforcement

- `--publish` refuses any edition/source tuple outside the reviewed policy.
- Permanent UUID markers in `corpus/retired` prevent excluded editions from being imported again; markers work even before an edition exists on a fresh database.
- Migration `0011_corpus_rights_policy.sql` archives unapproved existing passages, stores persistent approvals/retirements, and restricts the shared public feed view. Verification and original-source downloads require presence in that same view.
- The removed files and their notes are preserved only in ignored local working storage, outside the Docker context and packaged corpus. Immutable database source/receipt evidence is retained privately for audit.
- Demo data uses exact excerpts from the retained editions and is tested against their pinned provenance.

These repository changes take effect on a live installation only after the migration and updated application are deployed. Historical external copies or blockchain records are not erased by retiring a website edition.

To verify every retained bundle:

```sh
for feed in corpus/published/*.json; do
  PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline verify "$feed"
done
```
