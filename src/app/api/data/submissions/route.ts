import { NextResponse, type NextRequest } from "next/server";
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
import { listSubmissionsSchema, createSubmissionSchema } from "@/lib/validation";
import {
  listSubmissions,
  submitUserReport,
  serializeSubmission,
  pendingSubmissionCount,
} from "@/lib/trust/workflow";

export const runtime = "nodejs";

/**
 * GET  /api/data/submissions?status=&limit=
 *   Reviewer + admin queue (REVIEW_VERIFICATIONS). Never returns to tourists.
 * POST /api/data/submissions
 *   Any authenticated user submits a report into the trust workflow. The report
 *   is attached to a USER_SUBMITTED source and enters SUBMITTED; it is NEVER live.
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.REVIEW_VERIFICATIONS);
  } catch (err) {
    return toErrorResponse(err);
  }

  const query = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listSubmissionsSchema.safeParse(query);
  const status = parsed.success ? parsed.data.status : undefined;
  const limit = parsed.success ? parsed.data.limit : 100;

  const items = await listSubmissions(db, { status, limit });
  const pending = await pendingSubmissionCount(db);

  return jsonOk({
    submissions: items.map((i) => serializeSubmission(i)),
    pendingCount: pending,
    status,
  });
}

export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireApiUser(request, db);
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
  const parsed = createSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const submission = await submitUserReport(db, {
    userId: ctx.user.id,
    userEmail: ctx.user.email,
    userName: ctx.user.name,
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    reportType: parsed.data.reportType ?? "observation",
    payload: parsed.data.payload,
    note: parsed.data.note,
    ipAddress: clientIp(request),
  });

  if (!submission) return jsonError(500, "Submission could not be created.");
  return NextResponse.json(
    { ok: true, submission: serializeSubmission(submission) },
    { status: 201 },
  );
}
