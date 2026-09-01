import { pgTable, text, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { destinations } from "./destinations";

/**
 * EVENTS
 * ------
 * Festivals, fairs, and scheduled events with a start/end time window.
 * Event info is sourced and verified; never fabricated.
 */

export const events = pgTable(
  "events",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    title: text("title").notNull(),
    description: text("description"),
    destinationId: text("destination_id").references(() => destinations.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    organizingBody: text("organizing_body"),
    referenceUrl: text("reference_url"),
    isRecurring: boolean("is_recurring").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_destination_idx").on(table.destinationId),
    index("events_start_idx").on(table.startsAt),
  ],
);
