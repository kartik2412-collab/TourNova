/**
 * Drizzle ORM schema — TourNova
 * -----------------------------
 * All tables are PostgreSQL-geographic-compatible. The schema is organized by
 * module so future modules extend cleanly without a rewrite.
 *
 *   geography.ts    countries / states / regions / districts
 *   destinations.ts destinations / attractions
 *   businesses.ts   hotels / restaurants / transport / services
 *   events.ts       festivals & scheduled events
 *   provenance.ts   data sources / source records / verifications / audits
 *   ingestions.ts   ingestion runs / items / field diffs (review envelopes)
 *   geo.ts          coordinate candidates (provenanced coordinates)
 *   prices.ts       FairPrice records + forecasts
 *   crowd.ts        crowd observations + forecasts
 *   users.ts        users, roles, auth
 *   userReports.ts  community-reported observations
 *   itineraries.ts  trip plans
 */

export * from "./geography";
export * from "./destinations";
export * from "./businesses";
export * from "./events";
export * from "./provenance";
export * from "./ingestions";
export * from "./geo";
export * from "./prices";
export * from "./crowd";
export * from "./users";
export * from "./userReports";
export * from "./itineraries";
