import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, jsonError, toErrorResponse } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { getDataQualitySummary, listQualityIssues } from "@/lib/admin/data-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/data-quality
 * ADMIN-only diagnostic queue derived from real database state.
 * Read-only — this endpoint never repairs or fabricates anything.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.MANAGE_INGESTION);
  } catch (err) {
    return toErrorResponse(err);
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 100) : 20;

  try {
    const [summary, issues] = await Promise.all([
      getDataQualitySummary(db),
      listQualityIssues(db, { limit }),
    ]);
    return NextResponse.json({ ok: true, summary, issues });
  } catch {
    return jsonError(500, "Failed to load data-quality indicators.");
  }
}
