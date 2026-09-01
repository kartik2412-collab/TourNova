import { pgTable, text, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { attractions } from "./destinations";
import { businesses } from "./businesses";

/**
 * PRICES — TourNova FairPrice
 * ---------------------------
 * "Know the price before you pay."
 *
 * A price record never pretends to be a single universal "current price".
 * It distinguishes:
 *   - OFFICIAL       government/authority-declared price (e.g. entry ticket)
 *   - LIVE_QUOTE     real-time quote from an authorized feed/business
 *   - RECENT_OBSERVATION  a recently captured verifiable observation
 *   - TYPICAL_RANGE  typical low–high range from aggregated reliable sources
 *   - ESTIMATE       model estimate (clearly labelled, not truth)
 *   - USER_REPORT    unverified user-submitted price (honour system, flagged)
 *
 * Provenance is preserved via the polymorphic target and the source-records
 * system, so a price is always traceable to where it came from.
 */

export const priceTypeEnum = {
  OFFICIAL: "OFFICIAL",
  LIVE_QUOTE: "LIVE_QUOTE",
  RECENT_OBSERVATION: "RECENT_OBSERVATION",
  TYPICAL_RANGE: "TYPICAL_RANGE",
  ESTIMATE: "ESTIMATE",
  USER_REPORT: "USER_REPORT",
} as const;

export const priceCategoryEnum = {
  AUTO: "AUTO",
  TAXI: "TAXI",
  FOOD: "FOOD",
  HOTEL: "HOTEL",
  ATTRACTION_TICKET: "ATTRACTION_TICKET",
  PARKING: "PARKING",
  LOCAL_SERVICE: "LOCAL_SERVICE",
  OTHER: "OTHER",
} as const;

export const currencyEnum = {
  INR: "INR",
  USD: "USD",
  EUR: "EUR",
  OTHER: "OTHER",
} as const;

export const priceRecords = pgTable(
  "price_records",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    // Polymorphic target: the attraction or business this price applies to.
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    attractionId: text("attraction_id").references(() => attractions.id, {
      onDelete: "set null",
    }),
    businessId: text("business_id").references(() => businesses.id, { onDelete: "set null" }),
    category: text("category").notNull().default(priceCategoryEnum.OTHER),
    priceType: text("price_type").notNull().default(priceTypeEnum.RECENT_OBSERVATION),
    // Numeric storage: amount in minor units when possible; here stored as text
    // decimal to keep precision without DB type quirks.
    amount: numeric("amount").notNull(),
    // Optional range upper bound for TYPICAL_RANGE records.
    amountMax: numeric("amount_max"),
    currency: text("currency").notNull().default(currencyEnum.INR),
    description: text("description"),
    // When this quote/observation was valid.
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validTo: timestamp("valid_to", { withTimezone: true }),
    // Verification/provenance is delegated to source_records via provenance_link.
    // A lightweight inline status keeps reads simple.
    verificationStatus: text("verification_status").notNull().default("UNAVAILABLE"),
    sourceRecordId: text("source_record_id"),
    collectedAt: timestamp("collected_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("price_records_target_idx").on(table.targetType, table.targetId),
    index("price_records_category_idx").on(table.category),
  ],
);

/** Model predictions should be stored separately so they never masquerade as truth. */
export const priceForecasts = pgTable("price_forecasts", {
  id: text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  priceRecordId: text("price_record_id").references(() => priceRecords.id, {
    onDelete: "cascade",
  }),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  predictedAmount: numeric("predicted_amount").notNull(),
  predictedAt: timestamp("predicted_at", { withTimezone: true }).notNull().defaultNow(),
  confidence: text("confidence").notNull().default("UNKNOWN"),
  modelVersion: text("model_version"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
