# TourNova — Architecture

## 1. Design principles

1. **India-scale, Gujarat-first.** Every name, table and API is geographically
   generic. Gujarat appears only as data rows. The platform must scale to a new
   state (e.g. Rajasthan, Kerala) by adding rows, not code.
2. **Truthfulness over features.** No fabricated facts. If data is not reliably
   known, the UI shows "Reliable data unavailable".
3. **Provenance preserved.** We store _where_ a value came from, not just the
   final value.
4. **Simple, maintainable, low-cost.** Avoid microservices and unnecessary
   dependencies. One Next.js application with a modular service layer is enough
   for an SIH-scale team today, and cleaves cleanly later if needed.
5. **Open standards, few vendor locks.** Map provider is abstracted; database is
   plain PostgreSQL (+ pgvector later); auth/z is generic.

## 2. Technology choices

| Concern            | Choice                                             | Why                                                              |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------- |
| Framework          | Next.js 16 (App Router)                            | Server Components, API routes, PWA-ready, single deployable unit |
| Language           | TypeScript                                         | Type safety across schema, API, UI                               |
| Styling            | Tailwind CSS v4                                    | Fast, consistent, mobile-first                                   |
| Database           | PostgreSQL                                         | Geospatial-ready, pgvector, free, ubiquitous                     |
| ORM                | Drizzle ORM                                        | SQL-transparent, light, great migration DX, easy geo queries     |
| Auth               | Credentials sessions + RBAC (implemented)          | scrypt hashing, server-side sessions, explicit permission matrix |
| Map                | Abstracted provider                                | Swap OpenStreetMap ↔ commercial later without refactors          |
| Crowd intelligence | Python + OpenCV + YOLO (planned, external to repo) | Compute-heavy; kept separate from the web app                    |
| AI                 | LLM + RAG over trusted data (planned)              | Answers cite sources; never the source of truth                  |

**Not chosen on purpose:** standalone microservices (premature), Prisma
(Drizzle is lighter and more transparent), bespoke map rendering (use a
provider), in-app turn-by-turn navigation (hand off to a nav app).

## 3. Application structure

```
src/app            Next.js routes (pages + API)
src/components     layout, auth forms, admin/review UIs, trust badges
src/lib/auth       password, session, CSRF, rate limits, audit, service, guards
src/lib/trust      verification workflow + source management services
src/lib/client     thin browser fetch helpers (session-aware)
src/lib/db         Drizzle schema (module-per-file) + lazy server client
src/lib/navigation module registry (single source for nav, landing, placeholders)
scripts            seed, admin bootstrap and maintenance scripts
docs               this documentation
```

Route groups map 1:1 to TourNova modules: `discover`, `map`, `plan`,
`fairprice`, `crowd`, `nearby`, `emergency`, `assistant`. Every module page is a
component-driven placeholder backed by the shared data-truth notice.

**Authentication & administration** pages group under `(auth)` (sign-in /
sign-up) and the top-level `account`, `review` and `admin` route groups. All are
server-rendered with a session check and permission gate; their interactive
parts are small client components (`use-session`, forms, managers).

## 4. Data architecture

**Geography** (generic): `countries → states → regions → districts`, then
`destinations → attractions`. `businesses` covers hotels, transport, emergency
services, parking, fuel, ATMs etc. via a category discriminator.

**Provenance** is the core: `data_sources` (ranked by a trust hierarchy) →
`source_records` (a captured value + its source at a point in time) →
`verifications` (who/when/how-reliably it was checked). `audit_logs` records
sensitive changes. See `docs/DATA_TRUTH.md`.

**Specialised modules** extend the base cleanly:

- `price_records` / `price_forecasts` → FairPrice
- `crowd_observations` / `crowd_forecasts` → Crowd
- `itineraries` / `itinerary_stops` → Plan
- `user_reports` → community data that is never trusted until verified

### Trust workflow

Community data enters through **`data_submissions`** (a captured fact awaiting
review), never directly into the live domain tables. The workflow in
`src/lib/trust/workflow.ts` models a document state machine:

```
SUBMITTED → REVIEWED → PUBLISHED     (live value written to source_records)
    └→ REJECTED (with reason)
    └→ CONFLICT  (two submissions disagree → resolves on approve/reject, with
                   the rejected one recorded as a conflict)
    └→ UNREVIEWABLE → UNAVAILABLE (data marked as never-verifiable)
PUBLISHED → EXPIRED (hard valid-until passes) → REOPEN
```

Only `PUBLISHED` data is exposed as a live, sourced record. See
`docs/DATA_TRUTH.md`. `data_sources` tracks the named origin (with a
`source_type` trust ranking, internal/official flags) and `source_records`
snapshot values over time so nothing is overwritten without a trace.

Every module can grow without rewriting the schema. Source priority hierarchy:

1. Government/statutory 2. Official destination 3. API/feed 4. Structured
   dataset 5. Verified business 6. User reports 7. Model estimate.

## 5. Security model

- **Sessions.** Opaque 256-bit tokens in an HttpOnly, SameSite=Lax cookie
  (`tn_session`, `Secure` in production). The database stores only the SHA-256
  hash, so a DB leak is not a session leak. Sessions are server-side and
  individually revocable; "sign out everywhere" and admin account changes
  revoke all of them.
- **Passwords.** scrypt (`N=16384, r=8, p=1`, 64-byte key, per-user salt) with
  an optional `AUTH_SECRET` pepper. Rejected input never reaches storage.
- **CSRF** for every mutation: a per-session anti-CSRF token is compared via a
  constant-time helper (default strict). Auth/DATA endpoints have **rate
  limiting** keyed by IP + account.
- **RBAC** via `rolePermissions` in `src/lib/auth/permissions.ts`;
  `requirePermission()` guards both route handlers and server-rendered pages.
  New accounts start as `TOURIST`; roles are granted by an `ADMIN`.
- **Audit log.** Every sign-in/out, role change, source write and submission
  decision records who/what/when/metadata. Credentials, tokens and CSRF values
  are never written to the log.
- Secrets only in server-side env vars (`.env.local`, git-ignored). No
  `NEXT_PUBLIC_` keys for private services. `.env.example` is the only committed
  env file.
- The DB client is server-only (lazy module with a clear "DATABASE_URL is not
  set" error at first use) and is never imported from client components.
- Route handlers validate input with Zod; every mutation is CSRF-protected and
  rate-limited.
- Location is privacy-conscious: opaque references by default, consent-based.

## 6. Rendering & performance

- Server Components render the shell, placeholders, and the auth/admin/review
  pages (fast, no client JS on the module pages).
- Client components are limited to the responsive header menu, auth forms,
  session hook, and the interactive admin/review/account panels.
- App-level `loading.tsx` (loading UI), `error.tsx` (global error boundary) and
  `not-found.tsx` provide consistent states.
- Mount-time data fetching in the client panels is deferred off the
  synchronous effect path (satisfies `react-hooks/set-state-in-effect`).

## 7. Map abstraction

Map feature code will call a thin internal interface (e.g.
`mapProvider.panTo(place)`, `mapProvider.getDirections(a, b)`). The concrete
provider (OpenStreetMap/Leaflet today, or an India-optimised provider with
better tile coverage/licensing later) is a configuration detail. This keeps
cost and licensing decisions swappable.

## 8. Future expansion (see also docs/ROADMAP.md)

- Optional OAuth/OIDC providers layered on the existing session + RBAC layer.
- Ingest pipelines (official APIs, CSV datasets) writing _verified_ `source_records`.
- RAG assistant querying only verified data, citing sources.
- Python crowd pipeline (OpenCV/YOLO) writing labelled `crowd_observations`.
- Geospatial queries (PostGIS/pgvector) for "near me" and vector search.
