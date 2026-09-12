# Pride and Prejudice — selection and context QC

This bundle preserves the unmodified [original Project Gutenberg file](https://www.gutenberg.org/cache/epub/1342/pg1342.txt) associated with the [official catalogue record](https://www.gutenberg.org/ebooks/1342). This expansion reused the already preserved original bytes; it did not retrieve a replacement file or create a new edition.

The preserved edition is Project Gutenberg eBook 1342. The original catalogue assessment identifies this edition as public domain in the USA. The original source includes editorial material and notices; only Austen’s novel text is selected.

All twelve former selections were replaced after the quality review found too many plot fragments, unclear speaker changes, or passages that did not offer a coherent point on their own. The new set uses complete, contiguous sentence windows on judgment, vanity, conversation, class, relationships, and changing one’s mind. The preserved normalized chapter titles include source punctuation; no parser or source text was changed.

Every context note distinguishes the narrator from the character speaking and identifies the relevant situation. A character’s assertion is not presented as Austen’s advice. For example, Charlotte’s pragmatic view of marriage is identified as hers, Elizabeth’s advice about remembering the past is accompanied by Darcy’s disagreement, and Elizabeth’s self-criticism is situated after reading Darcy’s letter.

## Selection and separate explanation

Thirty nonoverlapping exact sentence windows were selected from deterministic candidates of 18–80 words and at most six sentences. The final quotations are 18–65 words (mean 35.7). The assistant read the candidate windows in their surrounding source, then separately read every final quote and its explanation for coherent boundaries, attribution, and faithful context. No quotation wording was rewritten.

Each passage has an `aiContext` explanation generated offline by the assistant: `generatedBy` is `AI`, and `generatedAt` is `2026-09-12T19:40:55.080706Z`. All explanations are trimmed, no more than 600 characters, and 18–45 words. These explanations are editorial interpretation, separate from the exact quote and its source receipt; verifying a quote does not prove an explanation. No human editorial review, external AI API selector call, authenticated publisher identity, or blockchain anchoring is claimed.

The existing selector contract remains `heuristic`. New curation reasons explicitly record assistant selection and contextual screening. 0 earlier exact passage IDs retain all prior quotation, provenance, and curation fields, with only the separate AI context added. 12 earlier ranges are omitted from this replacement bundle. Source metadata, book and edition IDs, original bytes, the entire normalized document, and normalization version are byte-for-byte or structurally unchanged from the backed-up twelve-passage bundle. Changed ranges receive the pipeline’s deterministic IDs; no old ID is repurposed for different text.

## Preserved source and current bundle

| Artifact | Value |
| --- | --- |
| Original file | `pg1342.txt`, 772,386 bytes |
| Source edition | Ebook 1342; catalogue updated 2026-09-01 |
| Original retrieval time | `2026-09-10T22:21:01.314074Z` |
| Original SHA-256 | `3f6bb9d6f78e0293b56acd4714dd68cb7d6d1d293402031ce9d5a216bcaf9d75` |
| Normalized SHA-256 | `ba93ca2be1d530719c8670bd9deab899d8c72df50fb6af25c1f7eb26ad2ee0c1` |
| Current JSON SHA-256 | `f2e4af341c131a8ba0f3c3600a8e69fbca52249457244919bf34630a0e512c75` |
| Passage count | 30 |
| Pipeline / normalization | `0.2.0 / 1` |

## Selected windows

The display order below follows source order; existing curation ranks were preserved for retained passages.

| Order | Location | Words | Passage ID |
| --- | --- | --- | --- |
| 1 | Chapter I.]; paragraph 1 | 23 | `d8832bff-fa4a-5ab7-9b14-d3fc974f4e1a` |
| 2 | CHAPTER V.; paragraph 22 | 19 | `44ef5f47-528d-536c-a057-14a5f2b700a7` |
| 3 | CHAPTER V.; paragraph 23 | 39 | `24e26e5e-c263-58df-a0d9-5f40d4634fda` |
| 4 | CHAPTER VI.; paragraph 11 | 37 | `65c53db2-4606-5b5a-a462-9eaa95c69b89` |
| 5 | CHAPTER VII.; paragraph 43 | 28 | `251c4338-e2c7-53b9-a9ce-fc5a6b8c1d56` |
| 6 | CHAPTER VII.; paragraph 44 | 33 | `648eae0a-17d6-5fbc-9a23-544c2f9a7706` |
| 7 | CHAPTER X.; paragraph 26 | 23 | `2abce0df-d096-50f5-90db-05199ab634ac` |
| 8 | CHAPTER XI.; paragraph 21 | 42 | `c0262e16-89e3-5d97-a630-1549aef0369c` |
| 9 | CHAPTER XI.; paragraph 22 | 29 | `8bb46628-bdb0-55ba-aea0-c987ea855966` |
| 10 | CHAPTER XI.; paragraph 29 | 47 | `be2162d4-4b20-5249-a2fe-b787c1908a8f` |
| 11 | CHAPTER XI.; paragraph 31 | 24 | `fbbd564b-f11e-560f-a58b-f476ebb658fd` |
| 12 | CHAPTER XIX.; paragraph 21 | 28 | `13ce8588-dafd-562f-9a09-7a27291e4883` |
| 13 | CHAPTER XX.; paragraph 22 | 44 | `54f0c44d-d7b0-5404-92d2-346c850a7756` |
| 14 | CHAPTER XXII.; paragraph 9 | 42 | `b8095ceb-e019-5e98-af3a-c9446c590573` |
| 15 | CHAPTER XXII.; paragraph 23 | 48 | `155bf22c-19eb-5c68-940c-4d5ac9baf708` |
| 16 | CHAPTER XXIV.; paragraph 12 | 60 | `537b4f7b-908f-5571-9745-81282192f6d6` |
| 17 | CHAPTER XXIV.; paragraph 15 | 38 | `8c93af13-cd52-593c-9351-adc389a1ca10` |
| 18 | CHAPTER XXXI.; paragraph 14 | 28 | `af23e4a3-3ee3-51ac-a5b4-4bcae652d538` |
| 19 | CHAPTER XXXIII.; paragraph 15 | 28 | `a16e7ffa-0c7d-5483-b3ad-c166d2f8a474` |
| 20 | CHAPTER XXXVI.; paragraph 13 | 50 | `035fe95a-e82f-5dc4-a53e-23b6f90230b3` |
| 21 | CHAPTER XL.; paragraph 18 | 65 | `00855438-edd1-58c5-a2de-3310682ca659` |
| 22 | CHAPTER LVI.; paragraph 54 | 27 | `5d5151ab-af7f-5374-a17d-06ff554c0e46` |
| 23 | CHAPTER LVI.; paragraph 71 | 31 | `a3db4e17-eba7-5da4-a9cc-a022869a5129` |
| 24 | CHAPTER LVIII.; paragraph 8 | 34 | `1ccbc861-88d1-5790-b4ee-123e6971c6ee` |
| 25 | CHAPTER LVIII.; paragraph 13 | 44 | `9d7a2546-d5cf-51b5-95da-028a8d096ef6` |
| 26 | CHAPTER LVIII.; paragraph 23 | 29 | `634d9980-1b2b-5dd5-94c2-fba8581bc696` |
| 27 | CHAPTER LVIII.; paragraph 24 | 18 | `99282de4-069d-5c53-bb00-ce6269a6a63a` |
| 28 | CHAPTER LVIII.; paragraph 25 | 47 | `681c731a-6f81-57b9-9739-734489bf6eda` |
| 29 | CHAPTER LIX.; paragraph 12 | 30 | `011e2578-e108-5518-b83a-d488d9c1ee9b` |
| 30 | CHAPTER LX.; paragraph 3 | 36 | `e2a02b76-c4a4-54cd-9236-0fafff4e84f4` |

## Earlier ranges omitted by this QC pass

- `54ffb3ba-9b5d-5714-95f5-765461a3f410`
- `5208846a-2864-5f62-abdb-85d51b8dd27b`
- `6a517e12-f765-5670-a9e1-2c0c43f11eb2`
- `2ca94a44-ecd1-57d3-b471-39860429d7b2`
- `9ac67ade-a8c5-55ec-9c76-8a79ef6bf9e8`
- `29147f20-2ef3-54a7-a60d-ffa2cf6b05b1`
- `421f362c-b0f7-5b1c-9650-f8f3b7e6b0aa`
- `69302e2e-09cf-54d3-a89b-ff9d6ed9a4a6`
- `264bbb95-5efa-57bb-b20b-25c085e28a27`
- `835a0f88-d2ec-5540-ad1c-0c91fea9e6b2`
- `d6018db6-4df0-52c7-8916-1563b981fd30`
- `a036373a-e487-5264-99c8-95bb51667fa8`

## Verification

The existing source reproduction verifier passes. Additional checks confirm no overlapping windows; exact original metadata and normalized source equality; deterministic candidate membership; unchanged retained passage fields; unique ranks 1–30; and AI context length, generator label, and timestamp validity. The final assistant reading pass covered all thirty quotes and explanations.

```sh
PYTHONPATH=pipeline/src python3 -m good_doomscroller_pipeline verify corpus/published/pride-and-prejudice.json
```
