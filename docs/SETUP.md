# TourNova — Setup

## Prerequisites

- **Node.js ≥ 20.9** (tested on Node 24)
- **PostgreSQL ≥ 14** — locally (e.g. install or Docker), or a hosted one
  (Neon / Supabase / Railway). TourNova works with any standard PostgreSQL.

## 1. Install dependencies

```bash
npm install
```

## 2. Environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and set:

| Variable                | Required  | Example                                              |
| ----------------------- | --------- | ---------------------------------------------------- |
| `DATABASE_URL`          | yes       | `postgres://postgres:secret@localhost:5432/tournova` |
| `AUTH_SECRET`           | recommend | `openssl rand -base64 32` output                     |
| `AUTH_SESSION_TTL_DAYS` | no        | `30` (1–365; default 30)                             |

Optional tunables (see `.env.example`): the freshness thresholds
(`FRESHNESS_*`, in minutes) and `AUTH_ADMIN_PASSWORD` (used only by
`npm run db:create-admin` when `--password=` is not given). Map/AI placeholders
stay unused until those modules ship.

> **Security:** never commit real secrets. `.env*` is git-ignored;
> `.env.example` is the only committed template, with placeholders only.

## 3. Create the database

Create an empty database named e.g. `tournova`.

Docker example:

```bash
docker run --name tournova-pg -e POSTGRES_PASSWORD=secret -e POSTGRES_DB=tournova -p 5432:5432 -d postgres:16
```

## 4. Apply the schema

Two supported flows:

```bash
# A. Migration-based (recommended for shared/CI environments)
npm run db:generate   # generate SQL from schema into drizzle/
npm run db:migrate    # apply migrations

# B. Push-based (quick dev convenience)
npm run db:push
```

You can browse the schema with `npm run db:studio`.

## 5. Seed structural data (optional)

```bash
npm run db:seed
```

Inserts only factual administrative geography for the Gujarat pilot
(country/state/districts + pilot destination names). Runs against `DATABASE_URL`.
See `docs/DATA_TRUTH.md` for what the seed intentionally does NOT insert.

## 6. Create an administrator

New accounts always start as `TOURIST`; roles are granted by an `ADMIN`, so the
very first admin is created with a one-off script. It never logs the password:

```bash
# Password from env var (so it is not in shell history):
AUTH_ADMIN_PASSWORD='a-long-random-password' npm run db:create-admin -- --email admin@tournova.app --name "TourNova Admin"
# Or inline (less recommended — visible in process list):
npm run db:create-admin -- --email admin@tournova.app --password 'a-long-random-password'
```

If the account already exists it is simply promoted to `ADMIN` (not duplicated).

## 7. Run the app

```bash
npm run dev        # development → http://localhost:3000
npm run build      # production build
npm run start      # serve production build
```

After creating an admin, sign in at `/signin`, then use `/admin/users` to grant
roles, `/admin/sources` to manage data sources, and `/review` to process the
verification queue.

## Validation commands

```bash
npm run lint
npm run typecheck
npm run format:check
npm test           # unit tests (run against an in-memory Postgres, no DATABASE_URL needed)
```

## Troubleshooting

- **`DATABASE_URL is not set`** → copy `.env.example` to `.env.local` and set it.
- **Connection refused** → confirm PostgreSQL is running and the host/port/user
  are correct; for Neon/Supabase enable the `sslmode=require` hint.
- **Migration table conflict / schema drift** → prefer a fresh `npm run db:generate`
  then `npm run db:migrate`; or use `npm run db:push` in dev only.
- **Port 3000 busy** → `npm run dev -- -p 3001`.

## Windows notes

Commands above use npm/bash syntax. In PowerShell run them as-is (`npm` works
the same). Path separators inside scripts are handled by Node.
