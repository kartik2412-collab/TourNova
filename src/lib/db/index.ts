import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Database client — PostgreSQL via postgres.js.
 *
 * The client is created LAZILY on first query touch. This matters for the
 * build: Next.js collects route-handler configuration by importing modules,
 * and a connection string may legitimately be absent in that context. The
 * clear "DATABASE_URL is not set" error still fires the moment any code
 * actually runs a query without a configured database.
 *
 * `SERVER_ONLY`: this module imports a Node driver and MUST never be imported
 * from client components. Keep all `import { db } from "@/lib/db"` usage in
 * Server Components / route handlers / server actions.
 */

function createClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Fail loudly in any environment that actually tries to touch the DB.
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and provide a PostgreSQL connection string.",
    );
  }

  const client = postgres(connectionString, { max: 10, prepare: false });
  return drizzle(client, { schema });
}

export type Database = ReturnType<typeof createClient>;

function createLazyDb(): Database {
  let instance: Database | undefined;
  return new Proxy({} as unknown as Database, {
    get(_target, prop) {
      if (prop === "then") return undefined; // stay a non-thenable for imports
      const client = instance ?? (instance = createClient());
      return Reflect.get(client, prop);
    },
  });
}

const globalForDb = globalThis as unknown as { db?: Database };

export const db: Database = globalForDb.db ?? createLazyDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.db = db;
}
