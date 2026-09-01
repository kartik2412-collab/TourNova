/**
 * TourNova — admin bootstrap script.
 *
 * New accounts always start as TOURIST by design; roles are granted by an
 * ADMIN. This script is the one safe, audited path to create the very first
 * administrator (or promote an existing account).
 *
 *   npm run db:create-admin -- --email admin@tournova.app --name "TourNova Admin"
 *
 * The password comes from --password=..., or from the AUTH_ADMIN_PASSWORD env
 * var (so it is not logged to shell history). It is never logged by this
 * script.

 * Run: npm run db:create-admin -- --email <ADMIN_EMAIL> [--name "TourNova Admin"]
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";
import { signUp, normalizeEmail } from "../src/lib/auth/auth-service";
import { roles } from "../src/lib/auth/permissions";
import { writeAudit, auditActions } from "../src/lib/auth/audit";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  }

  const args = process.argv.slice(2);
  const emailArg = args.find((a) => a.startsWith("--email="))?.split("=")[1] ?? null;
  const nameArg = args.find((a) => a.startsWith("--name="))?.split("=")[1] ?? null;
  const passwordArg = args.find((a) => a.startsWith("--password="))?.split("=")[1] ?? null;

  const email = normalizeEmail(emailArg ?? "");
  if (!email.includes("@")) {
    throw new Error("Usage: npm run db:create-admin -- --email admin@example.com [--name Name]");
  }

  const password = passwordArg ?? process.env.AUTH_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "No password provided. Use --password=... or set the AUTH_ADMIN_PASSWORD env var.",
    );
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);

  let targetId: string;
  if (existing.length === 0) {
    const user = await signUp(db, {
      email,
      password,
      name: nameArg ?? "TourNova Admin",
      ipAddress: null,
    });
    targetId = user.id;
    console.log(`Created account ${email}.`);
  } else {
    targetId = existing[0].id;
    console.log(`Account ${email} exists; promoting to ADMIN.`);
  }

  await db
    .update(schema.users)
    .set({ role: roles.ADMIN, isActive: true, updatedAt: new Date() })
    .where(eq(schema.users.id, targetId));

  await writeAudit(db, {
    userId: targetId,
    action: auditActions.USER_ROLE_CHANGED,
    entityType: "user",
    entityId: targetId,
    metadata: { newRole: roles.ADMIN, bootstrap: true },
    ipAddress: null,
  });

  console.log("Done. This account now has the ADMIN role.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
