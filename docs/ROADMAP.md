# TourNova — Roadmap

This document lists only _planned_ work. Nothing listed here is claimed to be
finished. The current foundation is described in the README and
`docs/ARCHITECTURE.md`.

## 1. Authentication & onboarding — shipped

Implemented: credentials sessions (scrypt + pepper, HttpOnly cookie, server-side
revocable sessions, per-session CSRF), roles/permissions (`TOURIST`,
`BUSINESS`, `AUTHORITY`, `ADMIN`), audit logging, rate limiting, account page,
admin user management and `scripts/create-user.ts` for the first admin.

Remaining on this track:

- Password change / reset flow (unblocks "forgot password").
- Optional OAuth/OIDC provider sign-in layered on the existing sessions.
- Email verification / phone OTP onboarding.

## 2. Verified data ingestion (Gujarat pilot)

### 2A. Source registry preparation — shipped

A rigid registry that lets Gujarat data be prepared without importing anything:
source classifications (`OFFICIAL_GOVERNMENT` … `UNKNOWN`), access/coverage/
licensing fields, explicit ingestion status transitions
(`DISCOVERED … PUBLISHED`, `UNAVAILABLE`), mechanical checks that never grant
trust, and human-resolved source conflicts. Service rules and invariants live in
`src/lib/trust/sources.ts` (tests in `sources.test.ts`); admin UI on
`/admin/sources`; no source is ever auto-classified, auto-trusted or
auto-published. Documented in `docs/DATA_TRUTH.md` → "Source registry".

### 2B. First real Gujarat ingestion pipeline — shipped (pipeline, verified)

Two real, official sources are wired end-to-end through the review workflow:

- **`gujarat-tourism` (TCGL)** — 15 official "Pick Your Trail" listing pages.
  Real `heritage-sites.html` parses to **53 unique destinations** (the page
  lists Uparkot Fort, Junagadh twice).
- **`asi-gujarat` (ASI)** — the official "Centrally Protected Monuments/Sites"
  national PDF; the parser isolates the **Gujarat section** and reproduces all
  **205 officially numbered monuments** (Vadodara Circle 159, Rajkot Circle 46)
  with every row mapped to a recognised Gujarat district.
- Pipeline (`src/lib/ingest/*`): permission-free `runIngestion` + CLI
  (`npm run ingest:gujarat-tourism`, `npm run ingest:asi:gujarat`); full
  provenance (`source_record` + `data_submission` → `PENDING_VERIFICATION`);
  auto-reject on mechanical validation failure; idempotent re-runs
  (`SKIPPED_DUPLICATE`); within-run duplicate handling that honours each
  source's own numbering; cross-source conflicts detected and queued — never
  auto-resolved. No coordinates are invented: ASI rows carry a "no coordinates
  from this source" warning; TCGL cards carry none by design.
- Admin review: `/admin/ingestion` (runs table, item triage with provenance,
  Approve / Reject / Mark unavailable; conflict badges). API under
  `/api/admin/ingestion`.
- Tests: `src/lib/ingest/` including PDF extractor fixtures, real-HTML parser
  regression, ASI section slicing + wrapped rows + duplicate register handling.
- Research record: `docs/DATA_SOURCES.md` (includes the correction that
  `download/719` is the **national** register, that `download/440` is a
  scanned-image PDF, and that OGD/data.gov.in does not host the district list).

Remaining on this track (requires real admin review + human decisions):

- Decide the 437 staged candidates in `/admin/ingestion` (Approve / Reject /
  Mark unavailable). Publishing verified destinations into the discover module
  is a manual, audited decision — nothing is auto-published.
- Add richer per-destination official feeds (times, fees, contact) from
  authorities where such single-source facts exist.

### 2C. Geo-intelligence: ingestion review surface + coordinate candidates — shipped (M3C)

- **Item-detail review surface** (`GET /api/admin/ingestion/:id` + the
  expandable panel in `/admin/ingestion`): source-registry metadata
  (organization, classification, access method, update frequency, license,
  usage terms, official reference URL), per-item freshness (policy class,
  verification state, validity window), the audit trail, verification history,
  duplicate records of the same entity, and **conflicts shown side-by-side**
  with both sources, their reference URLs and snapshotted values — a
  difference is never hidden behind a generic badge.
- **Coordinate candidates** (`coordinate_candidates` table + `src/lib/geo/*`):
  a coordinate is never invented. Every coordinate enters as a
  `PENDING_REVIEW` candidate carrying provenance (source kind, provider,
  geocoded query text, attribution, reference URL). Only an authorized
  reviewer can mark `APPROVED`; downstream features consume approved
  candidates only. Validation is mechanical (finite, lat/lon range, not the
  0,0 origin, plausibility inside the region of operation).
- **Geo provider abstraction** (`src/lib/geo/providers.ts`): a documented
  registry of geocoding providers (`manual`, `nominatim`, `google-places`,
  `mapbox`) with terms, attribution requirements, rate limits and reliability.
  Remote providers ship disabled and **require operator-supplied config** —
  no credential is invented or embedded.
- Admin API under `/api/admin/geo/candidates` (list / create / decide,
  `REVIEW_VERIFICATIONS` + CSRF for mutations). Tests in
  `src/lib/geo/*.test.ts`.

## 3. Discover module

- List destinations/attractions from the DB (currently seeded structural rows
  with `UNVAILABLE` optional fields intact).
- Destination detail pages showing all provenance-aware fields + status badges.

## 4. FairPrice module

- Display `price_records` grouped by category, honouring the price-type rules.
- Verification workflow for `USER_REPORT` → trusted records.

## 5. Crowd intelligence

- Python pipeline (OpenCV/YOLO object detection/tracking) for authorized/recorded
  video either in-app (clearly labelled DEMO) or internal.
- Store results as `crowd_observations` (`AUTHORITATIVE`/`ESTIMATED`/`DEMO`).
- Forecasting (`crowd_forecasts`) from historical + seasonal + event data.

## 6. Map & Nearby

- Map provider abstraction is now prepared (`src/lib/geo/providers.ts` + the
  candidate-coordinate model). To ship: the map UI (M3D) using approved
  candidates only, plus geospatial queries (PostGIS/pgvector) for "hotels near
  me", "hospital near destination", etc.
- Honest empty states will apply until coordinates have been approved: no
  marker, no guessed pin.

## 7. AI Assistant (RAG)

- Retrieve only over trusted/verified records; generate answers with sources
  shown; refuse to invent facts ("Reliable data unavailable").
- Multilingual support following the same generic data model.

## 8. India-wide expansion

Because the schema and naming are geographically generic, expanding to another
state means adding `states`/`districts`/`destinations` records and region-specific
sourced pipelines — no architectural changes.
