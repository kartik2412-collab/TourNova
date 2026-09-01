import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createTestDb } from "@/test/helpers";
import type { Database } from "@/lib/db";
import { users, sessions, auditLogs } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { hashSessionToken } from "@/lib/auth/session";
import {
  signUp,
  signIn,
  signOut,
  getCurrentSession,
  revokeAllMySessions,
  listLiveSessions,
  updateUserRole,
  setUserActive,
  AuthError,
} from "@/lib/auth/auth-service";

let db: Database;

const EMAIL = "rider@example.com";
const PASSWORD = "correct-horse-battery";

async function admin() {
  const id = randomUUID();
  await db.insert(users).values({
    id,
    email: `admin-${id.slice(0, 8)}@tournova.test`,
    passwordHash: await hashPassword(PASSWORD),
    role: "ADMIN",
  });
  return { id, role: "ADMIN" as const };
}

async function auditOf(userId: string) {
  return db
    .select({ action: auditLogs.action, metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(eq(auditLogs.userId, userId));
}

beforeAll(async () => {
  const setup = await createTestDb();
  db = setup.db;
});

describe("signUp", () => {
  it("creates a TOURIST account and audits it", async () => {
    const user = await signUp(db, {
      email: EMAIL,
      password: PASSWORD,
      name: "Rider",
      ipAddress: "10.0.0.1",
    });
    expect(user.email).toBe(EMAIL);
    expect(user.role).toBe("TOURIST");
    expect(user.passwordHash).not.toContain(PASSWORD);

    const rows = await db
      .select({ hash: users.passwordHash })
      .from(users)
      .where(eq(users.email, EMAIL));
    expect(rows[0]!.hash).toMatch(/^tn-scrypt;v=1;/);

    const actions = await auditOf(user.id);
    expect(actions.some((a) => a.action === "USER_SIGNUP")).toBe(true);
  });

  it("rejects a duplicate email", async () => {
    await expect(signUp(db, { email: EMAIL, password: PASSWORD })).rejects.toThrow(AuthError);
  });

  it("normalises email case", async () => {
    const user = await signUp(db, { email: "Mixed@Case.com", password: PASSWORD });
    expect(user.email).toBe("mixed@case.com");
  });
});

describe("signIn / session lifecycle", () => {
  it("creates a session with a hashed token and audits success", async () => {
    const { ctx, token } = await signIn(db, { email: EMAIL, password: PASSWORD });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(32);

    const stored = await db
      .select({ tokenHash: sessions.tokenHash, csrf: sessions.csrfToken })
      .from(sessions)
      .where(eq(sessions.userId, ctx.user.id));
    expect(stored).toHaveLength(1);
    // DB holds the hash, never the raw token.
    expect(stored[0]!.tokenHash).toBe(hashSessionToken(token));
    expect(stored[0]!.tokenHash).not.toBe(token);
    expect(stored[0]!.csrf).toBeTruthy();

    const session = await getCurrentSession(db, token);
    expect(session?.user.id).toBe(ctx.user.id);

    const actions = await auditOf(ctx.user.id);
    expect(actions.some((a) => a.action === "USER_SIGNIN_SUCCESS")).toBe(true);
  });

  it("gives the generic invalid message for a wrong password", async () => {
    await expect(signIn(db, { email: EMAIL, password: "totally-wrong" })).rejects.toThrow(
      "Invalid email or password.",
    );
    const found = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL));
    const actions = await auditOf(found[0]!.id);
    expect(actions.some((a) => a.action === "USER_SIGNIN_FAILED")).toBe(true);
  });

  it("gives the same message for an unknown email (no enumeration)", async () => {
    await expect(signIn(db, { email: "nobody@example.com", password: "whatever" })).rejects.toThrow(
      "Invalid email or password.",
    );
  });

  it("refuses to sign in a disabled account", async () => {
    const a = await admin();
    const target = await signUp(db, { email: "off@example.com", password: PASSWORD });
    await setUserActive(db, {
      actorRole: a.role,
      actorId: a.id,
      targetUserId: target.id,
      isActive: false,
    });
    await expect(signIn(db, { email: "off@example.com", password: PASSWORD })).rejects.toThrow();
  });

  it("signOut revokes the session so the token stops working", async () => {
    const { ctx, token } = await signIn(db, { email: EMAIL, password: PASSWORD });
    await signOut(db, token);
    await expect(getCurrentSession(db, token)).resolves.toBeNull();
    const actions = await auditOf(ctx.user.id);
    expect(actions.some((a) => a.action === "USER_SIGNOUT")).toBe(true);
  });
});

describe("role / activity management", () => {
  it("updateUserRole changes the role and revokes active sessions", async () => {
    const a = await admin();
    const user = await signUp(db, { email: "promote@example.com", password: PASSWORD });
    const { token } = await signIn(db, { email: "promote@example.com", password: PASSWORD });
    await expect(getCurrentSession(db, token)).resolves.not.toBeNull();

    await updateUserRole(db, {
      actorRole: a.role,
      actorId: a.id,
      targetUserId: user.id,
      role: "AUTHORITY",
    });

    const row = await db.select({ role: users.role }).from(users).where(eq(users.id, user.id));
    expect(row[0]!.role).toBe("AUTHORITY");
    await expect(getCurrentSession(db, token)).resolves.toBeNull();

    const actions = await auditOf(a.id);
    expect(actions.some((x) => x.action === "USER_ROLE_CHANGED")).toBe(true);
  });

  it("setUserActive(false) revokes sessions", async () => {
    const a = await admin();
    const user = await signUp(db, { email: "deactivate@example.com", password: PASSWORD });
    const { token } = await signIn(db, { email: "deactivate@example.com", password: PASSWORD });
    await setUserActive(db, {
      actorRole: a.role,
      actorId: a.id,
      targetUserId: user.id,
      isActive: false,
    });
    await expect(getCurrentSession(db, token)).resolves.toBeNull();
    const actions = await auditOf(a.id);
    expect(actions.some((x) => x.action === "USER_ACTIVITY_CHANGED")).toBe(true);
  });

  it("a non-admin cannot change roles", async () => {
    const nonAdmin = await signUp(db, { email: "plain@example.com", password: PASSWORD });
    const target = await signUp(db, { email: "target@example.com", password: PASSWORD });
    await expect(
      updateUserRole(db, {
        actorRole: "TOURIST",
        actorId: nonAdmin.id,
        targetUserId: target.id,
        role: "ADMIN",
      }),
    ).rejects.toThrow();
  });
});

describe("session listing / revoke everywhere", () => {
  it("lists only live sessions and revokes them all on request", async () => {
    const user = await signUp(db, { email: "sessions@example.com", password: PASSWORD });
    const one = await signIn(db, { email: "sessions@example.com", password: PASSWORD });
    const two = await signIn(db, { email: "sessions@example.com", password: PASSWORD });
    await signIn(db, { email: "sessions@example.com", password: PASSWORD });
    await signOut(db, two.token);

    const live = await listLiveSessions(db, user.id);
    expect(live).toHaveLength(2);

    await revokeAllMySessions(db, user.id, "127.0.0.1");
    expect(await listLiveSessions(db, user.id)).toHaveLength(0);
    await expect(getCurrentSession(db, one.token)).resolves.toBeNull();

    const actions = await auditOf(user.id);
    expect(actions.some((x) => x.action === "USER_SESSIONS_REVOKED")).toBe(true);
  });
});
