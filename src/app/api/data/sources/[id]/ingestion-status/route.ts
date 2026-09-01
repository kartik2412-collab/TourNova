import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  requireApiUser,
  assertCsrf,
  toErrorResponse,
  jsonError,
  jsonOk,
  clientIp,
  logSecurityEvent,
} from "@/lib/auth/guards";
import { permissions } from "@/lib/auth/permissions";
import { advanceIngestionStatus } from "@/lib/trust/sources";
import { advanceIngestionSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * POST /api/data/sources/:id/ingestion-status
 * Move a source one explicit step along the ingestion lifecycle
 * (DISCOVERED → ACCESSIBLE → INGESTED → VALIDATED → REVIEW_REQUIRED →
 * PUBLISHED / UNAVAILABLE). PUBLISHED additionally requires a confirmed
 * classification; availability checks never auto-advance a source.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireApiUser(request, db, permissions.MANAGE_DATA_SOURCES);
  } catch (err) {
    return toErrorResponse(err);
  }
  try {
    assertCsrf(ctx, request.headers.get("x-csrf-token") ?? "");
  } catch (err) {
    await logSecurityEvent(db, { userId: ctx.user.id, kind: "csrf_failed" });
    return toErrorResponse(err);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body.");
  }
  const parsed = advanceIngestionSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");

  const { id } = await params;
  await advanceIngestionStatus(db, {
    actor: { id: ctx.user.id, role: ctx.user.role },
    sourceId: id,
    to: parsed.data.to,
    note: parsed.data.note,
    ipAddress: clientIp(request),
  });
  return jsonOk({ ingestionStatus: parsed.data.to });
}
