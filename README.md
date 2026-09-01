# TourNova

**Intelligent Tourism & Travel Intelligence Platform for India.**

TourNova is an India-scale tourism platform whose **first real-data pilot is
Gujarat, India**. The architecture, database schema, APIs and naming are
geographically generic (`country`, `state`, `region`, `district`, `destination`,
`attraction`, `business`…) so the same platform scales to all of India without a
rewrite. Gujarat is a set of **data records**, not hardcoded architecture.

> **Data truth comes first.** TourNova never fabricates prices, crowd counts,
> opening hours, phone numbers, addresses or any factual tourism information.
> If reliable data is unavailable, the UI says exactly that — **"Reliable data
> unavailable."** Simulated data is always labelled `DEMO`, never presented as live.

---

## Status

This repository contains:

- Next.js 16 (App Router) + TypeScript + Tailwind CSS application shell
- Responsive, accessible navigation and placeholder pages for every module
- PostgreSQL database schema (Drizzle ORM) covering geography, destinations,
  attractions, businesses, users/roles, data sources & provenance, prices,
  crowd, events, itineraries and user reports
- **Identity & governance**: credentials authentication (scrypt + optional
  pepper, server-side revocable sessions, CSRF, rate limits), RBAC
  (`TOURIST`/`BUSINESS`/`AUTHORITY`/`ADMIN`), audit log, account & admin pages
- **Trust & data governance**: submission → review → publish workflow with
  conflict handling, data-source management and classification, freshness
  policy, and the review/admin UIs
- Documentation, a structural seed for the Gujarat pilot, and unit tests
  (50 tests, run against an in-memory Postgres)

Module pages (Discover, Map, Plan, FairPrice, Crowd, Nearby, Emergency, AI
Assistant) are **not yet implemented**. They are marked "coming soon" and
deliberately show **no fabricated data**.

---

## Getting started

Prerequisites: **Node.js ≥ 20.9**, **PostgreSQL ≥ 14** (local, Docker, or Neon).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
#    → set DATABASE_URL to your PostgreSQL connection string

# 3. Create the database schema
npm run db:generate   # verify/generate SQL migration from schema (or use db:push)
npm run db:migrate    # apply migrations to your database

# 4. (Optional) seed structural geography for the Gujarat pilot
npm run db:seed

# 5. Create an administrator (pick a strong password)
npm run db:create-admin -- --email admin@tournova.app --password 'a-long-random-password'

# 6. Run the development server
npm run dev
```

Open http://localhost:3000. See [docs/SETUP.md](docs/SETUP.md) for details.

### Environment variables

All variables are documented in [`.env.example`](.env.example). `DATABASE_URL`
is required; `AUTH_SECRET` is strongly recommended (it peppers password hashes).
Never commit real secrets — only `.env.example` is versioned.

---

## Scripts

| Command                   | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `npm run dev`             | Start the development server                 |
| `npm run build`           | Production build                             |
| `npm run start`           | Serve the production build                   |
| `npm run lint`            | ESLint                                       |
| `npm run typecheck`       | TypeScript check (`tsc --noEmit`)            |
| `npm run format`          | Prettier write                               |
| `npm run format:check`    | Prettier check                               |
| `npm run db:generate`     | Generate a Drizzle migration from the schema |
| `npm run db:migrate`      | Apply migrations                             |
| `npm run db:push`         | Push schema directly (dev convenience)       |
| `npm run db:studio`       | Open Drizzle Studio                          |
| `npm run db:seed`         | Seed structural geography (Gujarat pilot)    |
| `npm run db:create-admin` | Create/promote an ADMIN account              |
| `npm test`                | Unit tests (in-memory Postgres, no server)   |

---

## Repository structure

```
tournova/
├── docs/                    # Architecture, data-truth, setup, roadmap
├── drizzle/                 # Generated SQL migrations
├── scripts/
│   ├── seed.ts              # Structural geography seed (no fabricated facts)
│   └── create-user.ts       # Admin bootstrap (existing accounts are promoted)
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── layout.tsx       # Shell: header, footer, metadata
│   │   ├── page.tsx         # Landing page
│   │   ├── loading|error|not-found.tsx
│   │   ├── discover|map|plan|fairprice|crowd|nearby|emergency|assistant/
│   │   ├── (auth)/          # sign-in, sign-up pages
│   │   ├── account|review|admin/   # session, review & admin (role-gated)
│   │   └── api/             # health + auth + data/submissions + admin/users...
│   ├── components/
│   │   ├── layout/          # Header (responsive nav), footer
│   │   ├── ui/              # Button, Card/Badge, status badges
│   │   ├── shared/          # Loading/empty/error states, data-truth notice
│   │   ├── auth|account|review|admin/   # interactive panels
│   │   └── trust/           # verified-badge, freshness, provenance display
│   ├── lib/
│   │   ├── auth/            # password, session, CSRF, rate-limit, audit,
│   │   │                    #   auth-service (app logic), guards, permissions
│   │   ├── trust/           # workflow.ts, sources.ts (trust services)
│   │   ├── client/          # browser helpers: use-session, api
│   │   ├── db/
│   │   │   ├── index.ts     # Lazy PostgreSQL client (server-only)
│   │   │   └── schema/      # Drizzle schema, module per file
│   │   ├── validation.ts    # Zod schemas for every route handler
│   │   ├── data-policy.ts   # freshness thresholds (env-tunable)
│   │   └── navigation.ts    # Module registry for nav + landing
├── .env.example
├── drizzle.config.ts
└── ...
```

Detailed documentation lives in [`docs/`](docs/):

- [Architecture](docs/ARCHITECTURE.md) — why the stack and structure were chosen
- [Data truth & provenance](docs/DATA_TRUTH.md) — the zero-fabrication policy
- [Setup](docs/SETUP.md) — environment, database, troubleshooting
- [Roadmap](docs/ROADMAP.md) — planned expansion, India-wide, crowds, FairPrice
