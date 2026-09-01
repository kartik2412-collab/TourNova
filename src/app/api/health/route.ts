import { NextResponse } from "next/server";

/**
 * Health check.
 *
 * Reports application status and (optionally, when configured) database
 * reachability. Never returns secrets or connection strings.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

  let database: "configured" | "unconfigured" | "unreachable" = hasDatabaseUrl
    ? "configured"
    : "unconfigured";

  if (hasDatabaseUrl) {
    try {
      // dynamic import so the module only loads when actually used
      const { db } = await import("@/lib/db");
      await db.execute("SELECT 1");
      database = "configured";
    } catch {
      database = "unreachable";
    }
  }

  const healthy = database !== "unreachable";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      service: "tournova",
      timestamp: new Date().toISOString(),
      database,
    },
    { status: healthy ? 200 : 503 },
  );
}
