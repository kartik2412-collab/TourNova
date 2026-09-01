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
import { createSourceSchema } from "@/lib/validation";
import { createSource, listSources } from "@/lib/trust/sources";

export const runtime = "nodejs";

/**
 * GET  /api/data/sources
 *   Admin + authority source registry (MANAGE_DATA_SOURCES). Never exposes
 *   internal `updatedAt`/`createdById`-derived data beyond what the source
 *   management UI needs.
 * POST /api/data/sources
 *   Register a new information source. Never active by default (isActive=false)
 *   and never official by default (sourceType=OTHER unless admin overrides).
 */
export async function GET(request: NextRequest) {
  try {
    await requireApiUser(request, db, permissions.MANAGE_DATA_SOURCES);
  } catch (err) {
    return toErrorResponse(err);
  }
  const sources = await listSources(db);
  return jsonOk({ sources });
}

export async function POST(request: NextRequest) {
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
  const parsed = createSourceSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? "Invalid input.");
  }

  const source = await createSource(db, {
    actor: { id: ctx.user.id, role: ctx.user.role },
    source: parsed.data,
    ipAddress: clientIp(request),
  });
  return NextResponse.json(
    {
      ok: true,
      source: {
        id: source.id,
        name: source.name,
        sourceType: source.sourceType,
        isActive: source.isActive,
        reliability: source.reliability,
        updateFrequency: source.updateFrequency,
      },
    },
    { status: 201 },
  );
}
