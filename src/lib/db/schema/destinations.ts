import { pgTable, text, timestamp, doublePrecision, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { districts } from "./geography";

/**
 * DESTINATIONS & ATTRACTIONS
 * --------------------------
 * A Destination is a traveller-facing place a user can visit (a city/town or a
 * major tourism area). An Attraction is a specific point of interest (a
 * monument, a stepwell, a wildlife sanctuary) that belongs to a Destination.
 *
 * Pilot destinations such as Somnath, Gir, Rani Ki Vav etc. are DATA ROWS,
 * not hardcoded architecture. Gujarat is simply the first populated state.
 */

export const destinations = pgTable(
  "destinations",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    nameLocal: text("name_local"),
    description: text("description"),
    districtId: text("district_id").references(() => districts.id, { onDelete: "set null" }),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    // ISO 639-1 primary language code for the destination, e.g. "en".
    primaryLanguage: text("primary_language").notNull().default("en"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("destinations_district_idx").on(table.districtId)],
);

export const attractionCategoryEnum = {
  MONUMENT: "MONUMENT",
  HERITAGE: "HERITAGE",
  NATURE: "NATURE",
  WILDLIFE: "WILDLIFE",
  HILL_STATION: "HILL_STATION",
  BEACH: "BEACH",
  RELIGIOUS: "RELIGIOUS",
  MUSEUM: "MUSEUM",
  ADVENTURE: "ADVENTURE",
  OTHER: "OTHER",
} as const;

export const attractions = pgTable(
  "attractions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    destinationId: text("destination_id")
      .notNull()
      .references(() => destinations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameLocal: text("name_local"),
    category: text("category").notNull().default(attractionCategoryEnum.OTHER),
    description: text("description"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    entryFeeStatus: text("entry_fee_status").notNull().default("UNAVAILABLE"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attractions_destination_idx").on(table.destinationId),
    index("attractions_category_idx").on(table.category),
  ],
);
