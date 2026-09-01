import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, toErrorResponse, jsonOk, jsonError } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { getSubmission, serializeSubmission } from "@/lib/trust/workflow";

export const runtime = "nodejs";

/**
 * GET /api/data/submissions/:id
 * Full provenance for one submission (source, source record, submitted by).
 * Reviewer + admin only.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireApiUser(request, db, permissions.REVIEW_VERIFICATIONS);
  } catch (err) {
    return toErrorResponse(err);
  }
  const { id } = await params;
  const row = await getSubmission(db, id);
  if (!row) return jsonError(404, "Submission not found.");
  return jsonOk({ submission: serializeSubmission(row) });
}
