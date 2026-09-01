import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * USER REPORTS
 * ------------
 * Community-contributed observations (crowd, prices, status, hazards, tips).
 * User reports are explicitly labelled USER_REPORTED and are NOT trusted as
 * authoritative until verified. They feed review/verification workflows.
 */

export const userReports = pgTable(
  "user_reports",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Polymorphic target the report is about.
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reportType: text("report_type").notNull(),
    // Reported value/body (subject to verification).
    payload: text("payload"),
    // Report that was invalidated/merged, if any.
    inheritedFromId: text("inherited_from_id"),
    verificationStatus: text("verification_status").notNull().default("USER_REPORTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("user_reports_target_idx").on(table.targetType, table.targetId),
    index("user_reports_user_idx").on(table.userId),
  ],
);
