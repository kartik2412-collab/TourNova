import { pgTable, text, integer, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { attractions } from "./destinations";

/**
 * CROWD INTELLIGENCE
 * ------------------
 * The system strictly separates:
 *   - AUTHORITATIVE   exact count from an authorized counter/sensor/camera system
 *   - ESTIMATED       current crowd calculated from legitimate signals
 *   - PREDICTED       forecast from historical/contextual data
 *
 * We NEVER claim an exact crowd number unless a trustworthy source provides it.
 * Unknown crowd is shown as "Reliable data unavailable", never a guessed figure.
 *
 * For the SIH prototype, recorded/authorized video OR clearly labelled simulated
 * data may be used, but it must be flagged as DEMO/SIMULATION.
 */

export const crowdSourceEnum = {
  AUTHORITATIVE: "AUTHORITATIVE",
  ESTIMATED: "ESTIMATED",
  PREDICTED: "PREDICTED",
  USER_REPORTED: "USER_REPORTED",
  DEMO: "DEMO",
} as const;

export const crowdObservations = pgTable(
  "crowd_observations",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    attractionId: text("attraction_id")
      .notNull()
      .references(() => attractions.id, { onDelete: "cascade" }),
    sourceType: text("source_type").notNull().default(crowdSourceEnum.ESTIMATED),
    // The actual reported count (only meaningful for AUTHORITATIVE sources).
    count: integer("count"),
    // Capacity context if known, for a relative "how busy" rating.
    capacity: integer("capacity"),
    // 0-100 derived crowd level; may be null when unknown.
    crowdLevel: integer("crowd_level"),
    // ISO 639-1 locale if the observation was localized.
    locale: text("locale").notNull().default("en"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    sourceRecordId: text("source_record_id"),
    verificationStatus: text("verification_status").notNull().default("UNAVAILABLE"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("crowd_obs_attraction_idx").on(table.attractionId, table.capturedAt),
    index("crowd_obs_status_idx").on(table.verificationStatus),
  ],
);

/** Forecasts are model predictions — always labelled, never presented as live counts. */
export const crowdForecasts = pgTable(
  "crowd_forecasts",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    attractionId: text("attraction_id")
      .notNull()
      .references(() => attractions.id, { onDelete: "cascade" }),
    forecastFor: timestamp("forecast_for", { withTimezone: true }).notNull(),
    predictedLevel: integer("predicted_level"),
    predictedCount: integer("predicted_count"),
    confidence: text("confidence").notNull().default("UNKNOWN"),
    modelVersion: text("model_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("crowd_forecast_attraction_idx").on(table.attractionId, table.forecastFor)],
);
