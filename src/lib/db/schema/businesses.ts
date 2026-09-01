import { pgTable, text, timestamp, doublePrecision, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { destinations } from "./destinations";

/**
 * BUSINESSES & TOURISM PROVIDERS
 * ------------------------------
 * A generic "business" table covers hotels, restaurants, transport providers,
 * local services, shops, etc. The category discriminates the type. Specific
 * type tables (hotels, transport, emergency services) link back or extend this
 * base where needed, keeping the model simple and extensible.
 */

export const businessCategoryEnum = {
  HOTEL: "HOTEL",
  RESTAURANT: "RESTAURANT",
  TRANSPORT: "TRANSPORT",
  EMERGENCY: "EMERGENCY",
  PHARMACY: "PHARMACY",
  SHOP: "SHOP",
  LOCAL_SERVICE: "LOCAL_SERVICE",
  PARKING: "PARKING",
  FUEL: "FUEL",
  ATM: "ATM",
  OTHER: "OTHER",
} as const;

export const businesses = pgTable(
  "businesses",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull().default(businessCategoryEnum.OTHER),
    destinationId: text("destination_id").references(() => destinations.id, {
      onDelete: "set null",
    }),
    // Short, human-readable address (NOT geo-verified until checked).
    address: text("address"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    // Owner-claimed contact, subject to verification.
    contactPhone: text("contact_phone"),
    contactEmail: text("contact_email"),
    websiteUrl: text("website_url"),
    openingHours: text("opening_hours"),
    // Verification policy: never present unverified contact details as LIVE.
    isVerified: boolean("is_verified").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("businesses_destination_idx").on(table.destinationId),
    index("businesses_category_idx").on(table.category),
  ],
);
