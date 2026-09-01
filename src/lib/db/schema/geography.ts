import { pgTable, text, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * GEOGRAPHIC HIERARCHY
 * --------------------
 * Generic administrative geography that scales to any country.
 * A deployment region (first pilot: Gujarat) is just rows in these tables.
 *
 * Hierarchy:  country > state (admin level 1) > region > district
 *
 * `region` typically refers to a cultural/tourism region (e.g. Kutch),
 * while `district` is the administrative district. Both are optional to
 * support countries with different administrative shapes.
 */

export const countries = pgTable("countries", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  // ISO 3166-1 alpha-2 code, e.g. "IN"
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  nameLocal: text("name_local"),
  phoneCode: text("phone_code"),
  currencyCode: text("currency_code").notNull().default("INR"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const states = pgTable(
  "states",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    countryId: text("country_id")
      .notNull()
      .references(() => countries.id, { onDelete: "cascade" }),
    // e.g. "GJ" for Gujarat
    code: text("code").notNull(),
    name: text("name").notNull(),
    nameLocal: text("name_local"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("states_country_idx").on(table.countryId)],
);

export const regions = pgTable(
  "regions",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    stateId: text("state_id")
      .notNull()
      .references(() => states.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameLocal: text("name_local"),
    // Optional centroid for region-level mapping.
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("regions_state_idx").on(table.stateId)],
);

export const districts = pgTable(
  "districts",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    stateId: text("state_id")
      .notNull()
      .references(() => states.id, { onDelete: "cascade" }),
    // Optional link to a cultural/tourism region.
    regionId: text("region_id").references(() => regions.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    nameLocal: text("name_local"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("districts_state_idx").on(table.stateId)],
);
