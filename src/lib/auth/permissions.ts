/**
 * Authorisation foundation — roles & permissions.
 *
 * Permissions are explicit and centralised here rather than scattered through
 * the code. Each role gets exactly the permission set it needs.
 *
 * This is the architecture layer for authZ. The authN (login/session) layer is
 * a separate future step; these helpers are ready to be wired into it.
 *
 * Roles:
 *   TOURIST    — travel discovery, planning, reports (read-mostly)
 *   BUSINESS   — owns a business profile and can maintain its own data
 *   AUTHORITY  — tourism authority: analytics, verification workflows
 *   ADMIN      — platform administration: ingest, verify, manage users
 */

export const roles = {
  TOURIST: "TOURIST",
  BUSINESS: "BUSINESS",
  AUTHORITY: "AUTHORITY",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof roles)[keyof typeof roles];

export const permissions = {
  // Discovery & travel (tourist-facing read access)
  READ_DESTINATIONS: "READ_DESTINATIONS",
  READ_ATTRACTIONS: "READ_ATTRACTIONS",
  READ_BUSINESSES: "READ_BUSINESSES",
  READ_PRICES: "READ_PRICES",
  READ_CROWD: "READ_CROWD",
  READ_EMERGENCY: "READ_EMERGENCY",
  READ_MAP: "READ_MAP",
  READ_ITINERARIES: "READ_ITINERARIES",
  // Tourist actions
  CREATE_ITINERARY: "CREATE_ITINERARY",
  SUBMIT_USER_REPORT: "SUBMIT_USER_REPORT",
  SUBMIT_PRICE_REPORT: "SUBMIT_PRICE_REPORT",
  // Business self-service
  MANAGE_OWN_BUSINESS: "MANAGE_OWN_BUSINESS",
  // Authority & administration
  VIEW_ANALYTICS: "VIEW_ANALYTICS",
  REVIEW_VERIFICATIONS: "REVIEW_VERIFICATIONS",
  MANAGE_DESTINATIONS: "MANAGE_DESTINATIONS",
  MANAGE_DATA_SOURCES: "MANAGE_DATA_SOURCES",
  VERIFY_DATA: "VERIFY_DATA",
  MANAGE_USERS: "MANAGE_USERS",
  AUDIT_LOG: "AUDIT_LOG",
} as const;

export type Permission = (typeof permissions)[keyof typeof permissions];

/** Every read permission grants at least read access to verified public data. */
export const rolePermissions: Record<Role, readonly Permission[]> = {
  TOURIST: [
    permissions.READ_DESTINATIONS,
    permissions.READ_ATTRACTIONS,
    permissions.READ_BUSINESSES,
    permissions.READ_PRICES,
    permissions.READ_CROWD,
    permissions.READ_EMERGENCY,
    permissions.READ_MAP,
    permissions.READ_ITINERARIES,
    permissions.CREATE_ITINERARY,
    permissions.SUBMIT_USER_REPORT,
    permissions.SUBMIT_PRICE_REPORT,
  ],
  BUSINESS: [
    permissions.READ_DESTINATIONS,
    permissions.READ_ATTRACTIONS,
    permissions.READ_PRICES,
    permissions.READ_CROWD,
    permissions.READ_MAP,
    permissions.MANAGE_OWN_BUSINESS,
    permissions.SUBMIT_USER_REPORT,
  ],
  AUTHORITY: [
    permissions.READ_DESTINATIONS,
    permissions.READ_ATTRACTIONS,
    permissions.READ_BUSINESSES,
    permissions.READ_PRICES,
    permissions.READ_CROWD,
    permissions.READ_MAP,
    permissions.VIEW_ANALYTICS,
    permissions.REVIEW_VERIFICATIONS,
    permissions.VERIFY_DATA,
  ],
  ADMIN: [
    permissions.READ_DESTINATIONS,
    permissions.READ_ATTRACTIONS,
    permissions.READ_BUSINESSES,
    permissions.READ_PRICES,
    permissions.READ_CROWD,
    permissions.READ_MAP,
    permissions.VIEW_ANALYTICS,
    permissions.REVIEW_VERIFICATIONS,
    permissions.MANAGE_DESTINATIONS,
    permissions.MANAGE_DATA_SOURCES,
    permissions.VERIFY_DATA,
    permissions.MANAGE_USERS,
    permissions.AUDIT_LOG,
  ],
};

/** Returns true when the given role holds a permission. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in roles;
}

/**
 * Accepts a role from the database (which is typed `string` because the column
 * is plain text) as well as the typed Role union, and validates at runtime.
 */
export function roleHasPermission(
  role: Role | string | null | undefined,
  permission: Permission,
): boolean {
  if (!isRole(role)) return false;
  return rolePermissions[role].includes(permission);
}

/**
 * Authorize a request by role. Throws a typed error when unauthorized so route
 * handlers / server actions can translate it into a 403.
 */
export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function requirePermission(
  role: Role | string | null | undefined,
  permission: Permission,
): void {
  if (!roleHasPermission(role, permission)) {
    throw new AuthorizationError();
  }
}
