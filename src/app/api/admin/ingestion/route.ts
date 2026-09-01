import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, toErrorResponse, jsonError, jsonOk } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { listIngestionRunsSchema, listIngestionItemsSchema } from "@/lib/validation";
import { listRuns, listItems } from "@/lib/ingest/review";

export const runtime = "nodejs";

/**
 * GET /api/admin/ingestion?view=runs|items[&status=][&runId=][&limit=]
 * Admin review surface for the ingestion pipeline (Milestone 3B).
 * Requires REVIEW_VERIFICATIONS. Items carry per-field diff (ingestion_changes),
 * provenance, collected time, source URL, trust state and open-conflict count.
 */
export async function GET(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireApiUser(request, db, permissions.REVIEW_VERIFICATIONS);
  } catch (err) {
    return toErrorResponse(err);
  }
  void ctx;

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "runs";
  const status = url.searchParams.get("status") ?? undefined;
  const runId = url.searchParams.get("runId") ?? undefined;
  const limit = url.searchParams.get("limit") ?? undefined;

  if (view === "items") {
    const parsed = listIngestionItemsSchema.safeParse({ status, runId, limit });
    if (!parsed.success) return jsonError(400, "Invalid query parameters.");
    const items = await listItems(db, {
      status: parsed.data.status,
      runId: parsed.data.runId,
      limit: parsed.data.limit,
    });
    return jsonOk({ items, count: items.length });
  }

  const parsed = listIngestionRunsSchema.safeParse({ status, limit });
  if (!parsed.success) return jsonError(400, "Invalid query parameters.");
  const runs = await listRuns(db, { status: parsed.data.status, limit: parsed.data.limit });
  return jsonOk({ runs, count: runs.length });
}
