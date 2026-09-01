# TourNova — Data truth & provenance

## The zero-fabrication policy

**TourNova never fabricates factual information.** If reliable information
cannot be established, the application explicitly shows **"Reliable data
unavailable."**

TourNova must never invent:

- prices
- crowd counts
- opening hours
- phone numbers
- addresses
- hotel / attraction / government information
- emergency contacts
- transport fares
- events
- statistics

AI-generated content must never silently become factual database information.
Simulated/demo data must never be presented as live data.

## Provenance vocabulary

Every important factual data point should be able to answer:

| Question                                                   | How it is represented                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| **What is this data?**                                     | Entity (`attraction`, `business`, …) + `entity_type`/`entity_id`   |
| **Where did it come from?**                                | `data_sources` (name, classification, reference URL, organization) |
| **When was it collected?**                                 | `source_records.collected_at`                                      |
| **When last verified?**                                    | `verifications.last_verified_at` (+ `freshness_hours`)             |
| **How reliable is the source?**                            | `source_type` (trust ranking) + `verification_status`/`confidence` |
| **Live, verified, estimated, predicted or user-reported?** | `verification_status`/`price_type`/`crowd.source_type`             |

### Data statuses

`VERIFIED`, `LIVE`, `ESTIMATED`, `USER_REPORTED`, `PREDICTED`, `UNAVAILABLE`,
`DEMO`. `UNAVAILABLE` is a valid, honest state that the UI renders instead of a
guessed value.

## Source priority hierarchy

1. `OFFICIAL_GOVERNMENT` — government / statutory authority (entry fees, SB rules)
2. `OFFICIAL_AUTHORITY` — official destination organization / authority
3. `OPEN_DATA` — published open dataset from an authority or repository
4. `VERIFIED_BUSINESS` — the business that owns the fact (hours, price, capacity)
5. `USER_SUBMITTED` — community reports (always review-gated, see workflow)
6. `THIRD_PARTY` — a recognizable third-party information service
7. `UNKNOWN` — no classification claimed; never trusted

The exact ordering may vary by data type, but the principle is constant:
**preserve provenance rather than storing a bare final value.** A classification
is a **claim**, never a trust grant — confirming it does not activate a source.

## How the schema enforces this

- `data_sources` registers a named source with a classification, access method,
  geographic coverage, freshness class, licensing/usage terms and an explicit
  **ingestion status** — see "Source registry" below.
- `source_records` snapshots a value captured from a source at a time.
- `verifications` records checks (who/when/status/confidence) and freshness.
- Domain tables (prices, crowd, businesses) link back to `source_record_id`
  where they hold their inline status for fast reads.
- `price_forecasts` and `crowd_forecasts` are **separate** from live records so
  model output can never be confused with ground truth.
- `crowd_observations.source_type` = `AUTHORITATIVE` | `ESTIMATED` | `PREDICTED` |
  `USER_REPORTED` | `DEMO`. An exact count is only stored when an authorized
  source provides it.
- `user_reports` default to `USER_REPORTED` and are only promoted after review.

## FairPrice rules

- `OFFICIAL` = government/authority-declared price.
- `LIVE_QUOTE` = real-time quote from an authorized feed/business.
- `RECENT_OBSERVATION` = a recent verifiable observation.
- `TYPICAL_RANGE` = `amount`–`amountMax` from aggregated reliable records.
- `ESTIMATE` = model estimate, always labelled, never presented as current price.
- `USER_REPORT` = community-reported, flagged, subject to verification.

## The verification workflow

Community/unknown data enters through **`data_submissions`** — a captured fact
_awaiting review_ — never directly into the live domain tables. Reviewers route
it through a state machine (`src/lib/trust/workflow.ts`):

```
SUBMITTED → REVIEWED → PUBLISHED     (only now does a source_record get written)
    └→ REJECTED (with reason)
    └→ CONFLICT  (two submissions disagree; the workflow forces an explicit
                   approve/reject resolution and records the losing one)
    └→ UNREVIEWABLE → UNAVAILABLE
PUBLISHED → EXPIRED (valid-until passes) → REOPEN
```

- Only `PUBLISHED` (and reviewer-confirmed) data is exposed as live+sourced.
- Every transition is written to the audit log with the reviewer and reason.
- Conflicting submissions are auto-flagged, never silently merged.
- Freshness then governs UX: verified data older than its class threshold is
  shown stale, and expired data is shown as **"Reliable data unavailable"** —
  never re-presented as current.

## Source registry

`src/lib/trust/sources.ts` is the single home of registry rules. It implements
Milestone 3A of the roadmap: a rigid registry so Gujarat data can be **prepared**
without scraping or importing anything.

### Fields tracked per source

`name`, `source_type` (classification), `organization_name`, `reference_url`
(an official / reference URL for the claim), `description`, `access_method`,
`geographic_coverage`, `freshness_class`, `license`, `usage_terms`,
`reliability`, `update_frequency`, `is_active`, `is_internal`,
`classification_verified_at`, `last_checked_at`, `last_successful_fetch_at`,
`ingestion_status`, audit trail.

### The never-auto-trust rules

- A new source is created as `UNKNOWN` / `DISCOVERED` / **inactive**. `UNKNOWN`
  is the honest default — there is only one way to become trusted.
- `confirmSourceClassification` records that **an administrator confirmed the
  classification**. It never activates a source and never claims reliability.
- A source cannot be toggled active (`is_active = true`) unless its
  classification has been confirmed by an admin.
- `recordSourceCheck` records `last_checked_at` for an availability/health
  check. A successful check posts no value, changes no status, and **never**
  improves trust — it only records that the check happened.
- A source's reliability/classification/status is never altered by ingestion,
  by a check, or by the content of what was fetched.

### Ingestion status transitions

`DISCOVERED → ACCESSIBLE → INGESTED → VALIDATED → REVIEW_REQUIRED → PUBLISHED`,
with `UNAVAILABLE` as a reachable dead-end. Transitions are explicit and
whitelisted (`INGESTION_TRANSITIONS`): e.g. you cannot reach `PUBLISHED` from
anything except `VALIDATED`, and `PUBLISHED` additionally requires a
human-confirmed classification. `UNAVAILABLE` can be re-discovered. The move
target is validated, and every transition writes a
`SOURCE_INGESTION_ADVANCED` audit row with the actor and note.

### Source conflicts

`source_conflicts` records a **registered disagreement** between two source
records that are supposed to describe the same entity but carry different
values. Flagging is explicit (an admin or the system calling
`flagSourceConflict`), requires both records to exist and to refer to the same
entity, rejects identical values, and never merges or auto-wins: a conflict
stays `OPEN` until a human picks `ACCEPT_RECORD_A`, `ACCEPT_RECORD_B` or
`REJECT_BOTH` with a note. Resolutions and the flag itself are audit-logged
(`SOURCE_CONFLICT_FLAGGED` / `SOURCE_CONFLICT_RESOLVED`).

### API surface

`POST /api/data/sources/[id]/ingestion-status` (advance), `POST
/api/data/sources/[id]/check` (record a check), `GET|POST
/api/admin/source-conflicts` (list / flag), `POST
/api/admin/source-conflicts/[id]/resolve` (resolve). All gated by permission

- CSRF + audit.

### Milestone 3B — the real ingestion pipeline

`src/lib/ingest/*` turns registered sources into review-gated records without
bypassing any rule above:

- **Never fabricates and never auto-publishes.** `runIngestion` is
  permission-free only because it is a system-level import job; every candidate
  still lands as a `source_record` + `data_submission` in
  `PENDING_VERIFICATION`, and only an admin decision
  (`/api/admin/ingestion/[id]/decision`) can move it forward.
- **Mechanical validation only.** A malformed URL, unsupported category or
  impossible (out-of-bounding-box) coordinate auto-rejects a candidate; a
  source that provides no coordinates is a warning, never a guessed position.
- **Idempotent + honest about repeats.** Re-running a source with identical
  significant values (`SKIPPED_DUPLICATE`) neither imports nor overwrites.
  Within a single run, a source's own numbering wins: ASI _lists_ distinct
  monuments sharing a name+district (e.g. three "Jami Masjid" rows in Ahmedabad
  district) and the pipeline keeps each listed row via a full-identity key.
- **Conflicts are queued, never merged.** Two registered sources claiming
  different values for the same canonical entity (name+district) produce an
  `OPEN` `source_conflicts` row resolved only by a human.
- **Provenance-by-construction.** `raw_data` retains the verbatim source
  fields; `normalized_data` holds only source-declared values; reference URLs
  and collection times are recorded per record. Research records for the
  registered sources live in `docs/DATA_SOURCES.md`.

### Milestone 3C — coordinates are candidates

A coordinate is a factual claim like any other: **TourNova never guesses one.**
Geo features (map, nearby, directions) may only use coordinates that passed
review.

- `coordinate_candidates` records each coordinate with its provenance: how it
  was obtained (`source`), which provider produced it, the **exact query text**
  that was geocoded, the provider's returned place name, attribution, a
  reference URL and the submitter.
- Every candidate starts `PENDING_REVIEW`. Geocoding-provider output is treated
  exactly like a manual entry at this stage — **a candidate, never truth.** Only
  an authorized reviewer can mark `APPROVED` (or `REJECTED` with a note);
  nothing is auto-approved.
- Mechanical validation (`src/lib/geo/validate.ts`) rejects a candidate before
  it can be stored: finite, in valid lat/lon range, not the `0,0` origin, and
  plausibly inside the region of operation. This guards against malformed data —
  it does not make a plausible coordinate correct.
- Providers are abstracted behind a registry (`src/lib/geo/providers.ts`):
  `manual` (always available, reviewer-entered from an official source/survey)
  plus documented remote geocoders (`nominatim`, `google-places`, `mapbox`)
  which ship **disabled** and require operator-supplied credentials. TourNova
  never invents or embeds a provider key, and terms/attribution/rate limits are
  recorded per provider.
- Until a destination has an approved candidate, map/nearby screens must show an
  honest empty state — a missing pin, not an invented one.

### Milestone 3D — the map draws only approved candidates

The public map (`/map`) is a feature layer over `coordinate_candidates` with
`status = APPROVED` whose entity is itself approved for publication. Notifications
and providers are abstracted behind `src/lib/geo/map-provider.ts` (raster tiles:
public OSM by default, an operator-set `NEXT_PUBLIC_MAP_TILE_URL`, or a
key-gated Mapbox provider that is only selected when a token exists). The tile
images themselves are third-party map data with their own license — the
`attributionHtml` each provider declares is rendered over the map, and the
offline service worker (`public/map-sw.js`) caches tiles cache-first for repeat
offline viewing. A region with zero approved coordinates simply has no pins.

### Milestone 4 — Discover shows only approved destinations

`/discover` and `/discover/[entityId]` read the approved set
(`ingestion_items.status = APPROVED`) and join it to its source record and data
source so every card/detail carries provenance (source name, organization,
reliability, per-record reference URL, collected/verified time, freshness
class). A source that supplied no description renders "Description unavailable
from the source", never invented copy; a destination with an `OPEN`
`source_conflicts` row shows the two values side by side until a reviewer
resolves them. Approving the 437 staged candidates is what populates this
catalog — there is no auto-publication.

### Milestone 5 — Nearby distances are approved-coordinate math

`/nearby` measures distance only between entities that have an `APPROVED`
coordinate (`src/lib/geo/distance.ts`, haversine). A radius search returns
verified destinations inside the radius ordered by straight-line distance; there
is no estimation of road/travel time from guessed geometry, and hotel /
transport / emergency "near me" layers do not exist until those entity types
have approved coordinates.

## The seed script respects this

`npm run db:seed` inserts **only structural geography** (country/state/districts
and pilot destination names) — public administrative structure. It inserts no
descriptions, prices, coordinates, opening hours or contact details, and states
this in its output. Everything else starts as `NULL` → "Reliable data
unavailable" until a verified pipeline populates it.

## Checklists for developers

- [ ] Is this value sourced? If not, mark it `UNAVAILABLE`.
- [ ] Is this value a prediction or estimate? It must be labelled and stored in
      a forecast/estimate slot, never in a live slot.
- [ ] Is this simulated demo footage/data? It must be flagged `DEMO`/SIMULATION.
- [ ] Am I presenting a user report as verified? Do not — review first.
- [ ] Can the UI trace this value to a source record? If not, it should not be
      shown as trusted data.
