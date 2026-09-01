import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import * as schema from "@/lib/db/schema";
import type { Database } from "@/lib/db";

/**
 * In-memory PostgreSQL for tests.
 *
 * PGlite runs real Postgres (WASM) so drizzle migrations, `gen_random_uuid()`,
 * timestamps and the query builder all behave exactly as against a live server.
 * The client type differs from the app's postgres-js client, so we cast to the
 * shared `Database` type — services only use query-builder APIs common to both.
 */
export async function createTestDb(): Promise<{ client: PGlite; db: Database }> {
  const client = new PGlite();
  const db = drizzle(client, { schema }) as unknown as Database;
  await migrate(db as never, {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
  return { client, db };
}

export async function countAuditRows(db: Database): Promise<number> {
  const rows = await db.select({ id: schema.auditLogs.id }).from(schema.auditLogs);
  return rows.length;
}
