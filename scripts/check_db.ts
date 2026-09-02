import postgres from "postgres";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL environment variable is not set.");
  process.exit(1);
}
const sql = postgres(connectionString);

async function main() {
  console.log("=== DATA SOURCES ===");
  const sources =
    await sql`SELECT id, name, source_type, ingestion_status, is_active FROM data_sources`;
  console.table(sources);

  console.log("=== INGESTION RUNS ===");
  const runs =
    await sql`SELECT id, source_id, status, discovered_count, imported_count, created_at FROM ingestion_runs`;
  console.table(runs);

  console.log("=== INGESTION ITEMS COUNT & STATUS ===");
  const itemStatuses =
    await sql`SELECT status, decision, count(*) FROM ingestion_items GROUP BY status, decision`;
  console.table(itemStatuses);

  console.log("=== SAMPLE INGESTION ITEMS ===");
  const sampleItems =
    await sql`SELECT id, run_id, entity_type, entity_id, status, decision FROM ingestion_items LIMIT 5`;
  console.table(sampleItems);

  console.log("=== DESTINATIONS COUNT & STATUS ===");
  const dests = await sql`SELECT is_active, count(*) FROM destinations GROUP BY is_active`;
  console.table(dests);

  console.log("=== ATTRACTIONS COUNT & STATUS ===");
  const atts =
    await sql`SELECT entry_fee_status, is_active, count(*) FROM attractions GROUP BY entry_fee_status, is_active`;
  console.table(atts);

  console.log("=== DATA SUBMISSIONS STATUS ===");
  const subs =
    await sql`SELECT workflow_status, target_type, count(*) FROM data_submissions GROUP BY workflow_status, target_type`;
  console.table(subs);

  console.log("=== SOURCE RECORDS STATUS ===");
  const srcRecs =
    await sql`SELECT verification_status, entity_type, count(*) FROM source_records GROUP BY verification_status, entity_type`;
  console.table(srcRecs);

  console.log("=== PRICE RECORDS STATUS ===");
  const prices =
    await sql`SELECT verification_status, price_type, count(*) FROM price_records GROUP BY verification_status, price_type`;
  console.table(prices);

  console.log("=== CROWD OBSERVATIONS STATUS ===");
  const crowds =
    await sql`SELECT verification_status, source_type, count(*) FROM crowd_observations GROUP BY verification_status, source_type`;
  console.table(crowds);

  console.log("=== SOURCE CONFLICTS STATUS ===");
  const conflicts =
    await sql`SELECT status, entity_type, count(*) FROM source_conflicts GROUP BY status, entity_type`;
  console.table(conflicts);

  console.log("=== COORDINATE CANDIDATES STATUS ===");
  const coords =
    await sql`SELECT status, source, count(*) FROM coordinate_candidates GROUP BY status, source`;
  console.table(coords);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
