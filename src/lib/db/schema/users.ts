import { pgTable, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * USERS & ROLES
 * -------------
 * Role-based access control is explicit. Permissions are derived from the
 * role at the application layer (see src/lib/auth/config.ts), not scattered
 * through the code.
 */

export const roleEnum = {
  TOURIST: "TOURIST",
  BUSINESS: "BUSINESS",
  AUTHORITY: "AUTHORITY",
  ADMIN: "ADMIN",
} as const;

export const authProviderEnum = {
  CREDENTIALS: "CREDENTIALS",
  GOOGLE: "GOOGLE",
  PHONE: "PHONE",
} as const;

export const users = pgTable(
  "users",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    email: text("email").notNull().unique(),
    // Hashed password when using credentials auth. Never store plaintext.
    passwordHash: text("password_hash"),
    name: text("name"),
    phone: text("phone"),
    role: text("role").notNull().default(roleEnum.TOURIST),
    authProvider: text("auth_provider").notNull().default(authProviderEnum.CREDENTIALS),
    isActive: boolean("is_active").notNull().default(true),
    // Country code defaults to the platform's first deployment region,
    // but the schema is generic and holds the ISO country code.
    countryCode: text("country_code").notNull().default("IN"),
    // Privacy: stores an opaque reference, never raw location unless consented.
    defaultLocation: text("default_location"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("users_email_idx").on(table.email)],
);

/**
 * SESSIONS
 * --------
 * Server-side sessions. The browser only ever holds an opaque, random token in
 * an HttpOnly cookie; the database stores a SHA-256 HASH of that token (never
 * the token itself), so a database leak cannot be replayed as a session.
 *
 * Sessions are revocable: signing out, a password/role change, or an admin
 * deactivation revokes the row (revokedAt) and the token stops working.
 *
 * csrfToken is a per-session synchronizer token used to protect state-changing
 * requests against CSRF (the SameSite=Lax cookie is defense-in-depth).
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId),
    index("sessions_expiry_idx").on(table.expiresAt),
  ],
);
