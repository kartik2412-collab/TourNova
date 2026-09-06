import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, jsonError, toErrorResponse } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { getDashboardSummary, getAttentionQueue } from "@/lib/admin/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/dashboard
 * ADMIN-only summary of real database state for the command center.
 * Never returns secrets or fabrication — only genuine counts/queues.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.MANAGE_INGESTION);
  } catch (err) {
    return toErrorResponse(err);
  }

  try {
    const [summary, attention] = await Promise.all([
      getDashboardSummary(db),
      getAttentionQueue(db),
    ]);
    return NextResponse.json({
      ok: true,
      summary,
      attention,
    });
  } catch {
    return jsonError(500, "Failed to load dashboard data.");
  }
}
