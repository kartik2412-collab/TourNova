import { pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { destinations, attractions } from "./destinations";

/**
 * ITINERARIES & TRIP PLANNING
 * ----------------------------
 * A traveller's planned trip: a list of planned stops with dates.
 * Kept intentionally small for the foundation; expanded by the Plan module.
 */

export const itineraries = pgTable(
  "itineraries",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    destinationId: text("destination_id").references(() => destinations.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    startsOn: timestamp("starts_on", { withTimezone: true }),
    endsOn: timestamp("ends_on", { withTimezone: true }),
    // JSON itinerary content (stops, order, notes). Kept flexible for now.
    content: text("content"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("itineraries_user_idx").on(table.userId)],
);

export const itineraryStops = pgTable(
  "itinerary_stops",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    itineraryId: text("itinerary_id")
      .notNull()
      .references(() => itineraries.id, { onDelete: "cascade" }),
    attractionId: text("attraction_id").references(() => attractions.id, {
      onDelete: "set null",
    }),
    stopOrder: integer("stop_order").notNull().default(0),
    day: integer("day"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("itinerary_stops_itinerary_idx").on(table.itineraryId)],
);
