import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, jsonError, toErrorResponse } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { listRecentAuditLogs } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/audit
 * ADMIN-only recent audit activity (AUDIT_LOG permission).
 * Only safe fields are returned — never secrets, tokens or credentials.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.AUDIT_LOG);
  } catch (err) {
    return toErrorResponse(err);
  }

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 200) : 50;
  const action = url.searchParams.get("action")?.trim() || undefined;

  try {
    const entries = await listRecentAuditLogs(db, { limit, action });
    return NextResponse.json({ ok: true, entries });
  } catch {
    return jsonError(500, "Failed to load audit activity.");
  }
}
