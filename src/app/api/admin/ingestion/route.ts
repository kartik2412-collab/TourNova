import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, toErrorResponse, jsonError, jsonOk } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { listIngestionRunsSchema, listIngestionItemsSchema } from "@/lib/validation";
import { listRuns, listReviewQueue, getReviewStats, nextPendingItem } from "@/lib/ingest/review";

export const runtime = "nodejs";

/**
 * GET /api/admin/ingestion?view=runs|items[&status=][&runId=][&sourceId=]
 *     [&entityType=][&search=][&conflict=open|none|any][&page=][&limit=]
 * Admin (ADMIN-only MANAGE_INGESTION) review queue + recent runs (Chunk 4).
 * Items are paginated with deterministic ordering (created_at DESC, id ASC)
 * and carry per-field diff (ingestion_changes), provenance, collected time,
 * source URL, trust state and open-conflict count.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.MANAGE_INGESTION);
  } catch (err) {
    return toErrorResponse(err);
  }

  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "runs";
  const status = url.searchParams.get("status") ?? undefined;
  const runId = url.searchParams.get("runId") ?? undefined;
  const sourceId = url.searchParams.get("sourceId") ?? undefined;
  const entityType = url.searchParams.get("entityType") ?? undefined;
  const search = url.searchParams.get("search") ?? undefined;
  const conflict = url.searchParams.get("conflict") ?? undefined;
  const page = url.searchParams.get("page") ?? undefined;
  const limit = url.searchParams.get("limit") ?? undefined;
  const after = url.searchParams.get("after") ?? undefined;

  if (view === "stats") {
    const stats = await getReviewStats(db);
    return jsonOk({ stats });
  }

  if (view === "next") {
    const parsed = listIngestionItemsSchema.safeParse({
      runId,
      sourceId,
      entityType,
      search,
      conflict,
    });
    if (!parsed.success) return jsonError(400, "Invalid query parameters.");
    const next = await nextPendingItem(
      db,
      {
        runId: parsed.data.runId,
        sourceId: parsed.data.sourceId,
        entityType: parsed.data.entityType,
        search: parsed.data.search,
        conflict: parsed.data.conflict,
      },
      after ?? null,
    );
    return jsonOk({ item: next });
  }

  if (view === "items") {
    const parsed = listIngestionItemsSchema.safeParse({
      status,
      runId,
      sourceId,
      entityType,
      search,
      conflict,
      page,
      limit,
    });
    if (!parsed.success) return jsonError(400, "Invalid query parameters.");
    const result = await listReviewQueue(db, {
      status: parsed.data.status,
      runId: parsed.data.runId,
      sourceId: parsed.data.sourceId,
      entityType: parsed.data.entityType,
      search: parsed.data.search,
      conflict: parsed.data.conflict,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return jsonOk({
      items: result.items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    });
  }

  const parsed = listIngestionRunsSchema.safeParse({ status, limit });
  if (!parsed.success) return jsonError(400, "Invalid query parameters.");
  const runs = await listRuns(db, { status: parsed.data.status, limit: parsed.data.limit });
  return jsonOk({ runs, count: runs.length });
}
