import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import { users, sessions } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { hashSessionToken, generateSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { requireApiUser, assertCsrf } from "@/lib/auth/guards";
import { UnauthorizedError } from "@/lib/auth/guards";
import { AuthorizationError, permissions } from "@/lib/auth/permissions";

let db: Database;

async function createUser(email: string, role: string) {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email,
    name: email.split("@")[0],
    passwordHash: await hashPassword("test-pass-123"),
    role,
  });
  return { id, email, role };
}

async function createSessionFor(userId: string) {
  const token = generateSessionToken();
  await db.insert(sessions).values({
    id: randomUUID(),
    userId,
    tokenHash: hashSessionToken(token),
    csrfToken: "csrf-fixed-token",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60),
  });
  return token;
}

function requestWithCookie(token: string | null) {
  const headers = new Headers();
  if (token) headers.set("cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}`);
  return new NextRequest("http://localhost/api/admin/dashboard", { headers });
}

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
});

describe("requireApiUser (ADMIN gate)", () => {
  it("rejects a request with no session cookie", async () => {
    await expect(
      requireApiUser(requestWithCookie(null), db, permissions.MANAGE_INGESTION),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a request with an unknown/expired session token", async () => {
    await expect(
      requireApiUser(requestWithCookie(generateSessionToken()), db, permissions.MANAGE_INGESTION),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lets an ADMIN through with MANAGE_INGESTION", async () => {
    const admin = await createUser("admin@tournova.test", "ADMIN");
    const token = await createSessionFor(admin.id);
    const ctx = await requireApiUser(requestWithCookie(token), db, permissions.MANAGE_INGESTION);
    expect(ctx.user.email).toBe(admin.email);
  });

  it("block a TOURIST from MANAGE_INGESTION (ADMIN-only)", async () => {
    const tourist = await createUser("tourist@example.com", "TOURIST");
    const token = await createSessionFor(tourist.id);
    await expect(
      requireApiUser(requestWithCookie(token), db, permissions.MANAGE_INGESTION),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("block a BUSINESS from MANAGE_DATA_SOURCES (ADMIN-only)", async () => {
    const biz = await createUser("business@example.com", "BUSINESS");
    const token = await createSessionFor(biz.id);
    await expect(
      requireApiUser(requestWithCookie(token), db, permissions.MANAGE_DATA_SOURCES),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lets an AUTHORITY through with REVIEW_VERIFICATIONS but not MANAGE_INGESTION", async () => {
    const auth = await createUser("authority@example.com", "AUTHORITY");
    const token = await createSessionFor(auth.id);
    const ctx = await requireApiUser(
      requestWithCookie(token),
      db,
      permissions.REVIEW_VERIFICATIONS,
    );
    expect(ctx.user.role).toBe("AUTHORITY");
    await expect(
      requireApiUser(requestWithCookie(token), db, permissions.MANAGE_INGESTION),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe("assertCsrf", () => {
  it("rejects a mismatched CSRF token (no silent pass-through)", () => {
    expect(() => assertCsrf({ session: { csrfToken: "known" } }, "wrong")).toThrow(
      AuthorizationError,
    );
  });

  it("accepts the synchronizer token", () => {
    expect(() => assertCsrf({ session: { csrfToken: "known" } }, "known")).not.toThrow();
  });
});
