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
import { confirmSourceClassification } from "@/lib/trust/sources";
import { z } from "zod";

export const runtime = "nodejs";

const bodySchema = z.object({
  note: z.string().trim().max(4000).optional(),
});

/**
 * POST /api/data/sources/:id/classification
 * Record that a human reviewed and confirmed a source's declared classification
 * (government, official, authorized API, ...). This is what lets a source be
 * trusted; a claim on its own is never enough.
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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "Invalid input.");

  const { id } = await params;
  await confirmSourceClassification(db, {
    actor: { id: ctx.user.id, role: ctx.user.role },
    sourceId: id,
    note: parsed.data.note,
    ipAddress: clientIp(request),
  });
  return jsonOk({ confirmed: true });
}
