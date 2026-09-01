import { and, eq, isNull } from "drizzle-orm";
import { users, sessions } from "@/lib/db/schema";
import type { Database } from "@/lib/db";
import {
  roles,
  roleHasPermission,
  type Role,
  type Permission,
  requirePermission,
} from "./permissions";
import { hashPassword, verifyPassword } from "./password";
import { generateSessionToken, hashSessionToken, generateCsrfToken, sessionTtlMs } from "./session";
import { writeAudit, auditActions } from "./audit";
import { randomUUID } from "node:crypto";

/**
 * Authentication service (server-side only).
 *
 * All functions take the database explicitly so they can run against the real
 * PostgreSQL client in the app and an in-memory Postgres in tests without
 * importing a live connection.
 *
 * `db` must never be reached from client components — these functions are
 * invoked exclusively from route handlers / server components/actions.
 */

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export interface SignInInput {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface SignUpInput {
  email: string;
  password: string;
  name?: string | null;
  phone?: string | null;
  ipAddress?: string | null;
}

export interface SessionContext {
  session: typeof sessions.$inferSelect;
  user: typeof users.$inferSelect;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getCurrentSession(
  db: Database,
  token: string,
): Promise<SessionContext | null> {
  const tokenHash = hashSessionToken(token);
  const rows = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  const session = row.sessions;
  const user = row.users;

  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!user.isActive) return null;

  // Opportunistic last-used stamp (throttled to one write per 10 minutes).
  const lastUsed = session.lastUsedAt?.getTime() ?? 0;
  if (Date.now() - lastUsed > 10 * 60 * 1000) {
    await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, session.id));
  }

  return { session, user };
}

export async function signUp(db: Database, input: SignUpInput): Promise<SessionContext["user"]> {
  const email = normalizeEmail(input.email);

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    throw new AuthError("An account with this email already exists.");
  }

  if (input.password.length < 8 || input.password.length > 128) {
    throw new AuthError("Password must be between 8 and 128 characters.");
  }

  const passwordHash = await hashPassword(input.password);
  const id = randomUUID();
  // New accounts always start as TOURIST; roles are granted by an ADMIN.
  const [user] = await db
    .insert(users)
    .values({
      id,
      email,
      passwordHash,
      name: input.name?.trim() || null,
      phone: input.phone?.trim() || null,
      role: roles.TOURIST,
      authProvider: "CREDENTIALS",
      isActive: true,
    })
    .returning();

  await writeAudit(db, {
    userId: user.id,
    action: auditActions.USER_SIGNUP,
    entityType: "user",
    entityId: user.id,
    ipAddress: input.ipAddress,
  });

  return user;
}

export async function signIn(
  db: Database,
  input: SignInInput,
): Promise<{ ctx: SessionContext; token: string }> {
  const email = normalizeEmail(input.email);
  const found = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = found[0];

  // Constant-ish behaviour: unknown user and wrong password yield the same
  // generic error so accounts cannot be enumerated.
  const passwordOk = user?.passwordHash
    ? await verifyPassword(input.password, user.passwordHash)
    : false;

  if (!user || !passwordOk) {
    await writeAudit(db, {
      userId: user?.id ?? null,
      action: auditActions.USER_SIGNIN_FAILED,
      entityType: "user",
      entityId: user?.id ?? null,
      metadata: { reason: user ? "bad_password" : "unknown_user" },
      ipAddress: input.ipAddress,
    });
    throw new AuthError("Invalid email or password.");
  }

  if (!user.isActive) {
    throw new AuthError("This account has been disabled. Contact an administrator.");
  }

  const token = generateSessionToken();
  const sessionId = randomUUID();
  const csrfToken = generateCsrfToken();
  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionId,
      userId: user.id,
      tokenHash: hashSessionToken(token),
      csrfToken,
      expiresAt: new Date(Date.now() + sessionTtlMs()),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
    .returning();

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

  await writeAudit(db, {
    userId: user.id,
    action: auditActions.USER_SIGNIN_SUCCESS,
    entityType: "user",
    entityId: user.id,
    ipAddress: input.ipAddress,
  });

  return { ctx: { session, user }, token };
}

export async function signOut(
  db: Database,
  token: string,
  ipAddress?: string | null,
): Promise<void> {
  const tokenHash = hashSessionToken(token);
  const found = await db
    .select({ sessionId: sessions.id, userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .limit(1);
  const row = found[0];
  if (!row) return;

  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, row.sessionId));

  await writeAudit(db, {
    userId: row.userId,
    action: auditActions.USER_SIGNOUT,
    entityType: "user",
    entityId: row.userId,
    ipAddress,
  });
}

/** Revoke every live session of a user (used on role change / deactivation). */
export async function revokeAllUserSessions(db: Database, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

/** Own-account: list live sessions without exposing token hashes or CSRF tokens. */
export interface SessionRow {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  lastUsedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export async function listLiveSessions(db: Database, userId: string): Promise<SessionRow[]> {
  const rows = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
      lastUsedAt: sessions.lastUsedAt,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .orderBy(sessions.createdAt);
  return rows;
}

/** Sign out of every device signed-into an account (used by "log out everywhere"). */
export async function revokeAllMySessions(
  db: Database,
  userId: string,
  ipAddress?: string | null,
): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));

  await writeAudit(db, {
    userId,
    action: auditActions.USER_SESSIONS_REVOKED,
    entityType: "user",
    entityId: userId,
    ipAddress,
  });
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/** Admin: list users without exposing password hashes or session internals. */
export async function listUsers(db: Database, limit = 200): Promise<UserRow[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.createdAt)
    .limit(limit);
  return rows;
}

export async function updateUserRole(
  db: Database,
  input: {
    actorRole: Role | string;
    actorId: string;
    targetUserId: string;
    role: string;
    ipAddress?: string | null;
  },
): Promise<void> {
  requirePermission(input.actorRole, "MANAGE_USERS");
  if (!roles[input.role as Role]) {
    throw new AuthError("Unknown role.");
  }
  const [row] = await db
    .update(users)
    .set({ role: input.role, updatedAt: new Date() })
    .where(eq(users.id, input.targetUserId))
    .returning({ id: users.id, role: users.role });

  if (!row) throw new AuthError("User not found.");

  await revokeAllUserSessions(db, input.targetUserId);

  await writeAudit(db, {
    userId: input.actorId,
    action: auditActions.USER_ROLE_CHANGED,
    entityType: "user",
    entityId: input.targetUserId,
    metadata: { newRole: input.role },
    ipAddress: input.ipAddress,
  });
}

export async function setUserActive(
  db: Database,
  input: {
    actorRole: Role | string;
    actorId: string;
    targetUserId: string;
    isActive: boolean;
    ipAddress?: string | null;
  },
): Promise<void> {
  requirePermission(input.actorRole, "MANAGE_USERS");
  const [row] = await db
    .update(users)
    .set({ isActive: input.isActive, updatedAt: new Date() })
    .where(eq(users.id, input.targetUserId))
    .returning({ id: users.id, isActive: users.isActive });
  if (!row) throw new AuthError("User not found.");

  if (!input.isActive) {
    await revokeAllUserSessions(db, input.targetUserId);
  }

  await writeAudit(db, {
    userId: input.actorId,
    action: auditActions.USER_ACTIVITY_CHANGED,
    entityType: "user",
    entityId: input.targetUserId,
    metadata: { isActive: input.isActive },
    ipAddress: input.ipAddress,
  });
}

export { Role, Permission, roleHasPermission, roles };

export function hasPermission(
  user: { role: string } | null | undefined,
  permission: Permission,
): boolean {
  return roleHasPermission(user?.role as Role | undefined, permission);
}

/** Convenience: authorise a route by user + permission; throws AuthorizationError. */
export function assertPermission(
  user: { role: string } | null | undefined,
  permission: Permission,
): void {
  requirePermission(user?.role as Role | undefined, permission);
}

/** Never expose hash internals through serialisation. */
export function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}
