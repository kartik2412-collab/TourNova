# TourNova — Team development

This document is the shared rulebook for everyone working in this repository.
It exists so five to six developers can work in parallel without breaking each
other's work, the data, or the gates.

## The ground rules

- **Never work directly on `master`.** Every piece of work happens on a
  `feature/<topic>` branch cut from the latest `master`.
- **Never force-push, never rewrite history, never amend** once a branch has
  been pushed. Always add a new commit on top.
- **Every merge to `master` happens through a pull request** that (a) passes
  all gates (below) and (b) has at least one reviewer.
- Always pull `master` before cutting a new feature branch.
- Do not commit output, builds, or secrets (see Security).

## Required gates — run all of them before pushing a PR

```bash
npm run lint          # 0 errors (6 pre-existing warnings are accepted baseline)
npm run format:check  # clean
npm run typecheck     # clean
npx vitest run --maxWorkers=4   # 319 tests, 28 files (all must pass)
npm run build         # 26/26 routes
```

`--maxWorkers=4` matters: the test suite boots many in-memory PGlite
databases in parallel and can starve or flake with default parallelism.

## Files that need coordination

These files are touched by nearly every feature. If you must change one, say
so in your PR description and keep the change minimal:

- `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- `src/components/layout/site-header.tsx`, `site-footer.tsx`
- `src/components/ui/*` (shared primitives)
- `src/lib/ingest/*`, `src/lib/trust/*`, `src/lib/validation.ts`
- `src/lib/db/schema/*`, `drizzle/**`

Anything under `src/lib/admin/*` is the Admin Command Center module; it is
owned by that feature and should only be extended, not rewired.

## Database rules

- **Additive migrations only.** Never edit or delete an already-applied
  migration. Evolution happens by adding a new numbered migration
  (`drizzle-kit generate`).
- **Always register** the new migration in `drizzle/meta/_journal.json`
  (generation does this automatically) and commit the generated `.sql` +
  snapshot.
- **Never run `npm run db:push` against the shared database.** Push is for a
  personal throwaway database only.
- New migration numbers must be **coordinated** — only one migration per
  change, never two people adding `0007`.
- Schema and seed changes are approved by review like any other code, and the
  zero-fabrication policy in `docs/DATA_TRUTH.md` applies to everything you
  write.

### Known baseline consideration (do not "fix")

`drizzle/meta/_journal.json` lists migrations `0000`–`0006` and the database
has all seven registered, but only the `.sql` files for `0000`–`0006` exist
in the repo while the **snapshots for `0005` and `0006` are missing from
`drizzle/meta/`**. This is a pre-existing inconsistency. Do not try to
regenerate or repair it blind — coordinate before the first schema change so
the next generated migration is correct for the whole team.

## The data truth rule

TourNova never fabricates factual information. Never invent prices, crowd
counts, hours, phone numbers, addresses, statistics, or anything a tourist
might rely on. Unreliable/unavailable facts render as **"Reliable data
unavailable."** Import data shoulders the full provenance and trust pipeline
(`docs/DATA_TRUTH.md`, `docs/DATA_SOURCES.md`). Simulated or demo data must
never be presented as live data.

## Testing

- New logic gets unit tests; testable invariants belong next to the code
  (`*.test.ts`). Test databases are in-memory PGlite — never require a
  running PostgreSQL for tests.
- Do not weaken or delete existing tests to make new work pass.
- Run `npm test` (or `npx vitest run --maxWorkers=4`) locally before pushing.

## Security

- `.env.local` and all real secrets are git-ignored — never `git add -f` them,
  never paste a connection string or API key into code, tests, or PR text.
- IDs and secrets only live in environment variables; reference them through
  `process.env`.
- Keep the `AUTH_*` secret handling as-is; do not log session tokens or
  password hashes.

## Day-to-day flow

```bash
git checkout master
git pull
git checkout -b feature/<your-topic>
# ... work + tests + gates ...
git push -u origin feature/<your-topic>   # then open a PR into master
```