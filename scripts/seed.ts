/**
 * TourNova — seed script (structural geography only).
 *
 * IMPORTANT — DATA TRUTH:
 * This seed inserts ONLY administrative/geographic structure (country, state,
 * districts, pilot destination names) which is factual public structural data.
 *
 * It deliberately inserts:
 *   - NO descriptions, prices, crowd counts, opening hours, phone numbers or
 *     emergency contacts. Those must come from verified, sourced pipelines.
 *   - NO coordinates that have not been verified against a source. Destination
 *     coordinates are left NULL until sourced.
 *
 * Destination rows exist so developers can exercise the schema, but every
 * data field that is not yet trustworthy stays NULL — the UI shows
 * "Reliable data unavailable" for them.
 *
 * Run: npm run db:seed
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  console.log("Seeding structural geography for the Gujarat pilot (India-scale schema)…");

  // --- Source for all structural geography below ---
  // Marked internal so this reference data is traceable without pretending to
  // be a government feed. Get-or-create by stable name so re-runs never
  // duplicate the row.
  const internalSourceName = "TourNova structural geography (India admin divisions)";
  let [source] = await db
    .select({ id: schema.dataSources.id })
    .from(schema.dataSources)
    .where(eq(schema.dataSources.name, internalSourceName))
    .limit(1);
  if (!source) {
    [source] = await db
      .insert(schema.dataSources)
      .values({
        name: internalSourceName,
        sourceType: schema.sourceClassificationEnum.OPEN_DATA,
        organizationName: "TourNova internal reference dataset",
        description:
          "Administrative geography (country, state, districts) used as reference data for the Gujarat pilot. Structural only — no tourism facts.",
        isInternal: true,
        isActive: true,
      })
      .returning({ id: schema.dataSources.id });
  }

  // --- India / Gujarat ---
  // Get-or-create by stable natural keys: country.code, state.code within the
  // parent country. Unlike the managers above, the conflict .returning() trick
  // would return nothing for pre-existing rows, so the FK ids must come from a
  // lookup first.
  let [india] = await db
    .select({ id: schema.countries.id })
    .from(schema.countries)
    .where(eq(schema.countries.code, "IN"))
    .limit(1);
  if (!india) {
    [india] = await db
      .insert(schema.countries)
      .values({
        code: "IN",
        name: "India",
        nameLocal: "भारत",
        phoneCode: "+91",
        currencyCode: "INR",
      })
      .returning({ id: schema.countries.id });
  }
  const countryId = india.id as string;

  let [gujarat] = await db
    .select({ id: schema.states.id })
    .from(schema.states)
    .where(and(eq(schema.states.countryId, countryId), eq(schema.states.code, "GJ")))
    .limit(1);
  if (!gujarat) {
    [gujarat] = await db
      .insert(schema.states)
      .values({ countryId, code: "GJ", name: "Gujarat", nameLocal: "ગુજરાત" })
      .returning({ id: schema.states.id });
  }
  const stateId = gujarat.id as string;

  // --- Districts relevant to the pilot destinations (factual names only) ---
  const districtNames = [
    "Ahmedabad",
    "Mehsana",
    "Patan",
    "Gandhinagar",
    "Vadodara",
    "Narmada",
    "Panchmahal",
    "Junagadh",
    "Gir Somnath",
    "Devbhoomi Dwarka",
    "Kutch",
    "Dang",
  ];

  const districtByName = new Map<string, string>();
  for (const name of districtNames) {
    const [existing] = await db
      .select({ id: schema.districts.id })
      .from(schema.districts)
      .where(and(eq(schema.districts.stateId, stateId), eq(schema.districts.name, name)))
      .limit(1);
    if (existing) {
      districtByName.set(name, existing.id);
      continue;
    }
    const [row] = await db
      .insert(schema.districts)
      .values({ stateId, name })
      .returning({ id: schema.districts.id });
    districtByName.set(name, row.id);
  }

  // --- Pilot destinations (names + geography links only; no fabricated facts) ---
  const pilotDestinations: { slug: string; name: string; district: string }[] = [
    { slug: "ahmedabad", name: "Ahmedabad", district: "Ahmedabad" },
    { slug: "adalaj-stepwell", name: "Adalaj Stepwell", district: "Gandhinagar" },
    { slug: "modhera", name: "Modhera", district: "Mehsana" },
    { slug: "patan-rani-ki-vav", name: "Patan / Rani Ki Vav", district: "Patan" },
    { slug: "vadodara", name: "Vadodara", district: "Vadodara" },
    { slug: "statue-of-unity", name: "Statue of Unity · Kevadia", district: "Narmada" },
    { slug: "champaner-pavagadh", name: "Champaner-Pavagadh", district: "Panchmahal" },
    { slug: "gir", name: "Gir", district: "Junagadh" },
    { slug: "somnath", name: "Somnath", district: "Gir Somnath" },
    { slug: "dwarka", name: "Dwarka", district: "Devbhoomi Dwarka" },
    { slug: "kutch", name: "Kutch", district: "Kutch" },
    { slug: "saputara", name: "Saputara", district: "Dang" },
  ];

  let inserted = 0;
  for (const d of pilotDestinations) {
    const districtId = districtByName.get(d.district);
    const [existing] = await db
      .select({ id: schema.destinations.id })
      .from(schema.destinations)
      .where(eq(schema.destinations.slug, d.slug))
      .limit(1);
    if (existing) continue;
    await db.insert(schema.destinations).values({
      slug: d.slug,
      name: d.name,
      districtId,
    });
    inserted += 1;
  }

  console.log(`Done. Source: ${source.id}`);
  console.log(
    `Inserted ${inserted} new pilot destination(s); ${pilotDestinations.length - inserted} already present. All factual fields remain NULL -> "Reliable data unavailable".`,
  );
  console.log(
    "No prices, descriptions or coordinates were seeded — they must come from verified sources.",
  );

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
