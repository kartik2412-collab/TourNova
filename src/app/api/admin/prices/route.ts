import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireApiUser, toErrorResponse, jsonError, jsonOk } from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { listPriceReports } from "@/lib/catalog/prices";

export const runtime = "nodejs";

/**
 * GET /api/admin/prices[?limit=]
 * Reviewer queue of price reports (REVIEW_VERIFICATIONS). Lists every
 * USER_REPORT price record with its linked submission + submitter so a reviewer
 * can decide it. Public API never exposes this surface.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.REVIEW_VERIFICATIONS);
  } catch (err) {
    return toErrorResponse(err);
  }

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 200;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    return jsonError(400, "limit must be an integer between 1 and 200.");
  }

  const reports = await listPriceReports(db, { limit });
  return jsonOk({ reports, count: reports.length });
}
