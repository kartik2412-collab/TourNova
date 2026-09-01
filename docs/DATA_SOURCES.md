# TourNova — Data sources (Milestone 3B)

This document is the research record behind `src/lib/ingest/sources.ts`. Every
entry below is a **verified fact about a real source** — checked by fetching the
document — never a guess. Registry values flow from here.

## Pilot sources: two proven cross-source conflict pairs

| Key               | Organization                              | Document(s)                                                 | Coverage                | Access     | Licence notes                                     |
| ----------------- | ----------------------------------------- | ----------------------------------------------------------- | ----------------------- | ---------- | ------------------------------------------------- |
| `gujarat-tourism` | Tourism Corporation of Gujarat Ltd (TCGL) | 15 "Pick Your Trail" listing pages                          | State                   | Webpages   | © TCGL — reproduction by prior written permission |
| `asi-gujarat`     | Archaeological Survey of India (ASI)      | Official "Centrally Protected Monuments/Sites" national PDF | State (Gujarat section) | Public PDF | GoI publication; no explicit open-data licence    |

Both were fetched on 2026-08-31/09-01 and saved under
`%TEMP%\opencode\tournova-ingest\` for offline verification:
`heritage-sites.html`, `asi-719.pdf`.

---

## 1. Gujarat Tourism (TCGL) — `gujarat-tourism`

- **Organization:** Tourism Corporation of Gujarat Ltd (TCGL), the official
  Gujarat tourism body.
- **Reference:** https://www.gujarattourism.com/ — "Pick Your Trail" category
  listings.
- **Registry targets (15):**
  `beaches`, `bird-watching-sites`, `flora-fauna`, `gandhi-circuit`,
  `heritage-sites`, `religious-site`, `buddhist-circuit`,
  `unesco-world-heritage-site`, `indus-valley-civilization-sites`,
  `weekend-get-aways`, `museums`, `golf-tourism`, `handicrafts`,
  `gujarati-cuisines`, `wellness-tourism`.
- **Card structure (verified on the real page):**
  `<a href="…"><img …/><span>Name <span class="locationName">District</span></span></a>`.
  Each card yields name + district + absolute URL. No coordinates or
  descriptions are extracted — the source page carries none in these cards.
- **Real-document counts (heritage-sites.html, fetched 2026-09-01):**
  - 54 destination cards; **53 unique** — the page literally lists _Uparkot
    Fort, Junagadh_ **twice** (identical title/URL), so the within-run dedupe
    correctly yields 53 candidate destinations.
  - Historical regression: cards are bounded to the whole anchor — nav/promo
    text elsewhere on the page can never leak into a card name.
- **Licence/usage:** the website-policy states content is copyrighted by TCGL
  and may be reproduced only **with prior written permission** and accurate
  acknowledgement. Automated scraping is not documented as permitted, which is
  why ingestion is a **staged, review-gated pipeline** and the pilot ingests no
  TCGL creative text — only the factual name/district/URL strings that the
  listing itself declares.

## 2. Archaeological Survey of India (ASI) — `asi-gujarat`

- **Organization:** Archaeological Survey of India, Ministry of Culture.
- **Primary document:** `https://asi.nic.in/admin/whatsnew/download/719`
  — official PDF **"List of Centrally Protected Monuments / Sites"** (the
  national register).
- **Critical, verified findings (2026-08-31):**
  - The PDF is the **all-India national document** (3698 numbered rows across
    states), NOT a Gujarat-only file. The stage-1 assumption that `download/719`
    was Gujarat-only was **wrong and corrected**.
  - The Gujarat section is real and self-declaring:
    ```
    8. Gujarat  205   Vadodara Circle 159
                       Rajkot Circle  46
    ```
    The section header literally reads _"List of Centrally Protected
    Monuments / Sites under the jurisdiction of Gujarat (Vadodara Circle and
    Rajkot Circle)"_ and is followed by **205 numbered rows**
    (159 Vadodara + 46 Rajkot). The parser independently reproduced **205 rows
    with every row carrying a recognised Gujarat district** — zero
    district-less rows.
  - The document text layer is FlateDecode/`Tm`+`TJ` with UTF-16BE hex tokens
    and full-width table rows that repeat their header on every page. The
    extractor had to be repaired to (a) rebuild lines **per PDF page/stream** so
    identical y-coordinates on different pages never merge, and (b) decode
    `00XX` hex tokens as UTF-16BE. Verified against the real 3.2 MB file.
  - **Not usable as ASI text**: `download/440` (Vadodara Circle list) is a
    **scanned-image PDF** (CCITTFaxDecode, no text layer) — machine extraction
    is impossible without OCR. The ASI _webpage_
    `asi.nic.in/alphabetical-list-of-monuments-gujarat/` now returns a
    news/events page (no table, no fetched data) and was discarded.
  - **data.gov.in** (OGD) hosts state counts and visitor statistics but **not**
    the district-wise monument register, so no official machine-readable CSV
    exists there. A third-party curated re-packaging of the same ASI documents
    exists (dataful.in dataset 15656) but is **not used** — the official PDF is
    the source of record.
- **What is extracted per row:** monument name, locality (single token before
  the district — documented source-layout caveat), district. The **official
  row numbering** is authoritative: rows in the same district that share a
  name are separate listed monuments (e.g. three "Jami Masjid" rows in
  Ahmedabad district), and the pipeline keeps them apart via a full-identity
  key while their canonical name+district key still powers cross-source
  conflict detection.
- **Protection status guard rail:** every candidate records that it is a
  "centrally protected monument — structure is legally protected; facts are
  limited to the official list." The ASI document supplies **no coordinates**,
  so these rows validate with a `no coordinates available` warning and are
  never assigned invented positions.
- **Licence/usage:** GoI publication under the Ancient Monuments and
  Archaeological Sites and Remains Act, 1958. No explicit machine-readable
  reuse licence; automated download is limited to this single public document
  and reuse follows GoI disclosure policy with attribution.

## Encoding / extraction notes (for maintainers)

- `src/lib/ingest/pdf.ts` is a dependency-free FlateDecode text extractor.
  It reconstructs visual lines **per flushed content stream** — critical for
  documents whose pages repeat header rows at identical coordinates; without
  per-stream grouping those headers collapse into one garbage line.
- Text is shown with `[…] TJ` arrays (kerning sub-runs) and, where the font is
  a CID/UTF-16 font, `00XX` hex tokens that must be decoded as UTF-16BE.
- `src/lib/ingest/parsers.ts::parseAsiLines` slices the Gujarat section out of
  the bundled national document using the section heading, joins names that
  wrap across lines and page boundaries, and treats page numbers / repeated
  headers as transparent (never as rows).
- **Unreliable extraction is never data**: a PDF stream we cannot decode yields
  an empty result, which the pipeline records as failed/unavailable rather
  than inventing rows.
