import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, toErrorResponse, jsonError, jsonOk } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { getItemDetail } from "@/lib/ingest/review";
import { TrustError } from "@/lib/trust/workflow";

export const runtime = "nodejs";

/**
 * GET /api/admin/ingestion/:id
 * Full review envelope for one ingestion item (M3C): source-registry metadata,
 * audit trail, conflicting records with both sides' provenance, duplicates of
 * the same entity, freshness of the underlying source record, verification
 * trail, per-field changes. Requires REVIEW_VERIFICATIONS.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(request, db, permissions.REVIEW_VERIFICATIONS);
  } catch (err) {
    return toErrorResponse(err);
  }

  const { id } = await params;
  try {
    const detail = await getItemDetail(db, id);
    return jsonOk({ item: detail });
  } catch (err) {
    if (err instanceof TrustError) return jsonError(404, err.message);
    return toErrorResponse(err);
  }
}
