# Conservative edition review, September 13, 2026

The active library was reduced from 26 editions to **8 editions / 157 passages**.
Eighteen complete source bundles were withdrawn from publication. This is an
edition-specific editorial risk decision, not a finding that the previous U.S.
publication was unlawful or that the underlying classics cannot be used.

## Scope and standard

The review checked preserved source files as well as feed quotations because
verification downloads distribute the complete file, including front matter
and other contributions. It traced historical editions and relevant authors,
translators and editors using publisher, library and institutional sources.
Original source hashes were recalculated against the embedded bytes.

The conservative screen requires identified historical editions published by
1930, identified relevant historical contributors who died by 1925, and an
applicable public-domain basis or permission for supplemental digital material.
An unresolved material contribution or edition provenance causes exclusion.
Project Gutenberg's [collection-development policy](https://www.gutenberg.org/policy/collection_development.html)
provides the public-domain dedication for its supplemental covers and
transcriber additions; it does not resolve unrelated historical contributors.

**This standard is not a worldwide legal guarantee.** Country-specific terms,
moral rights, special protections, and source trademark conditions can differ.
The review does not purport to authenticate the authorship of every incidental
historical quotation. A lack of contrary evidence is not universal clearance.

## Retained exact editions

| Work | Historical edition / relevant contributors | Source |
| --- | --- | --- |
| The Autobiography of Charles Darwin | Francis Darwin's 1887 version; Charles died 1882, Francis 1925 | [PG 2010](https://www.gutenberg.org/ebooks/2010) |
| The Chemical History of a Candle | 1908 impression; Faraday died 1867, editor Crookes 1919 | [PG 14474](https://www.gutenberg.org/ebooks/14474) |
| Frankenstein | 1818 edition; Mary Shelley died 1851, Percy Shelley 1822 | [PG 41445](https://www.gutenberg.org/ebooks/41445) |
| Incidents in the Life of a Slave Girl | 1861 edition; Jacobs died 1897, editor Child 1880 | [PG 11030](https://www.gutenberg.org/ebooks/11030) |
| The Letters of Charles Dickens, Volume I | 1880 edition; Dickens died 1870, Mamie Dickens 1896, Georgina Hogarth 1917 | [PG 25852](https://www.gutenberg.org/ebooks/25852) |
| Life of Mozart | 1880 edition; Nohl died 1885, translator Lalor 1899, translation comparator Dohn 1901 | [PG 67828](https://www.gutenberg.org/ebooks/67828) |
| Narrative of the Life of Frederick Douglass | 1845 edition; Douglass died 1895, Garrison 1879, Phillips 1884 | [PG 23](https://www.gutenberg.org/ebooks/23) |
| The Tao Teh King | James Legge's 1891 translation; Legge died 1897 | [PG 216](https://www.gutenberg.org/ebooks/216) |

The exact electronic files are pinned in
[`publication-policy.json`](../../apps/web/scripts/publication-policy.json).
These decisions do not authorize another translation or a newer edition with
the same title. The [full first-half audit](rights-audit-a-2026-09-13.md) and
[second-half audit](rights-audit-b-2026-09-13.md) contain contributor evidence,
historical-edition links, preserved hashes and specific limitations.

## Withdrawn complete bundles

| Work | Reason under the conservative screen |
| --- | --- |
| A Vindication of the Rights of Woman | Untraced exact imprint and anonymous biographical sketch |
| Autobiography of Andrew Carnegie | Van Dyke died 1932; Louise Carnegie, a prefatory contributor, died 1946 |
| Autobiography of Benjamin Franklin | Editor Charles W. Eliot died 1926 |
| Autobiography of Goethe | Unresolved revision and borrowed-translation provenance |
| Emerson's Essays | Editor Edna Turpin died 1952 |
| Meditations, George Long translation | Exact historical print edition not established |
| Papers and Writings of Abraham Lincoln | Editor Lapsley's dates and exact imprint unresolved |
| The Philosophy of Friedrich Nietzsche | This is Mencken's book; Mencken died 1956 |
| Pride and Prejudice | The complete file includes Saintsbury's preface; he died 1933 |
| The Problems of Philosophy | Russell died 1970 |
| Sadhana | Tagore and identified translation/revision contributors fail the cutoff |
| The Story of My Life | Keller, Macy and Sullivan fail the cutoff |
| Talks to Teachers | Incorporated English translations have unresolved provenance |
| The Prophet | Gibran died 1931; later front matter also needs review |
| The Souls of Black Folk | Du Bois died 1963 |
| Theodore Roosevelt's Autobiography | Unidentified third-party correspondence remains in the complete file |
| Twenty Years at Hull House | Addams died 1935; other contributions were not exhaustively cleared |
| Wonderful Adventures of Mrs. Seacole | Editor W. J. S. is unidentified |

## Publication enforcement and source notices

The active corpus excludes these 18 JSON bundles and their per-book notes.
Retirement markers and persistent database records prevent accidental return.
The importer and database require approved edition/source tuples; the database
archives nonapproved passages and the public view excludes them. Verification
and source/proof download access require current public eligibility. Demo
passages now derive only from retained, reviewed source excerpts. Existing
private source and receipt history is preserved for audit rather than erased.

Migration `0012_anchor_publication_guard.sql` also requires current public
eligibility before adding receipts to a new blockchain batch or recording a
prepared/broadcast attempt, including retries of an old attempt. It verifies
receipt-to-edition identity, preserved source hashes and complete membership.
Previously pending mixed batches cannot acquire a new publication attempt while
any member is withdrawn. This database guard does not deploy or start a worker.
Updates recording the outcome of already-submitted transactions remain possible.
Deployment must drain active workers and apply `0011` before `0012`; subsequent
withdrawals must likewise coordinate with workers to avoid a database/network
timing gap. The guard cannot revoke bytes already sent to the network.

The reading and verification views display Gutenberg's required standard notice
with direct access to its full license. Original source files retain their
embedded notices; proof exports include the notice and license text. The source
licensing page distinguishes source terms from MIT software and CC0 metadata.

## Limits of removal

Withdrawal from the site does not erase earlier third-party downloads, prior
repository or private deployment backups, or immutable blockchain commitments.
An inspected finalized Douglass proof used the hash-only GDSANCH1 format, not
full literary text. Newer anchoring formats can preserve editorial reasons;
no assertion is made that the Company can delete already-finalized chain data.
No blockchain deletion or new publication transaction was undertaken as part
of the rights review.

The earlier 201-receipt V2 proposal, batch
`77704835-1956-4955-a959-d51028cd7045`, includes 135 reasons associated with 13
now-withdrawn editions. That complete proposed scope is superseded by this
publication decision and must not be broadcast under its old approval. Its
historical approval artifact is retained for audit; any narrower operation
requires a separately bound, reviewed scope and its applicable authorization.
