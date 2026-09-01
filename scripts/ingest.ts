/**
 * TourNova — sourced ingestion CLI (Milestone 3B).
 *
 * Runs a REAL ingestion pipeline against a live official source and reports the
 * outcome. Nothing is fabricated and nothing is auto-trusted: candidates land in
 * PENDING_REVIEW for an authorized human (admin ingestion UI / API).
 *
 *   npm run ingest:gujarat-tourism
 *   npm run ingest:asi:gujarat -- --max-items 500
 *
 * Requires DATABASE_URL (copy .env.example to .env.local) and network access to
 * the official source. Safe to run repeatedly — idempotent by design.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import { runIngestion, IngestError } from "../src/lib/ingest/pipeline";
import { INGEST_SOURCE_REGISTRY } from "../src/lib/ingest/sources";

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const match = /^--([^=]+)=(.+)$/.exec(a);
    if (match) {
      out[match[1]] = match[2];
    } else if (a.startsWith("--") && i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[a.slice(2)] = argv[++i];
    }
  }
  return out;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  }

  const args = parseArgs(process.argv.slice(2));
  const sourceKey = args.source ?? "";
  if (!(sourceKey in INGEST_SOURCE_REGISTRY)) {
    throw new Error(
      `Unknown --source. Choose one of: ${Object.keys(INGEST_SOURCE_REGISTRY).join(", ")}`,
    );
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });
  const config = INGEST_SOURCE_REGISTRY[sourceKey];

  console.log(`\n=== Ingestion run: ${config.name} ===`);
  console.log(`Source: ${config.referenceUrl}`);
  console.log(`Organisation: ${config.organizationName}`);
  console.log(`Licence note: ${config.license}`);
  console.log("Fetching live documents from the official source…\n");

  try {
    const summary = await runIngestion(db, {
      sourceKey,
      note: args.note ?? "Manual CLI run",
      maxItems: args.maxItems ? Number(args.maxItems) : 1000,
    });
    console.log("\n--- Run summary ---");
    console.log(`runId:          ${summary.runId}`);
    console.log(`status:         ${summary.status}`);
    console.log(`discovered:     ${summary.discoveredCount}`);
    console.log(
      `imported (new): ${summary.importedCount}  (changed vs previous: ${summary.changedCount})`,
    );
    console.log(`review required:${summary.reviewRequiredCount}`);
    console.log(`duplicates:     ${summary.duplicateCount}`);
    console.log(`rejected:       ${summary.rejectedCount}`);
    console.log(`conflicts:      ${summary.conflictCount}`);
    if (summary.urls.length > 0) console.log(`fetched:        ${summary.urls.join(", ")}`);
    if (summary.errors.length > 0) {
      console.log("errors:");
      for (const e of summary.errors) console.log(`  - ${e}`);
    }
    console.log(
      "\nAll candidates are PENDING_REVIEW. Approve/reject them in the admin ingestion UI.",
    );
  } catch (err) {
    if (err instanceof IngestError) {
      console.error(`\nIngestion aborted: ${err.message}`);
    } else {
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
