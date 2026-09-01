import { and, asc, eq, inArray } from "drizzle-orm";
import { dataSources, priceRecords, sourceRecords, verificationStatusEnum } from "@/lib/db/schema";
import { freshnessState } from "@/lib/data-policy";
import type { Database } from "@/lib/db";
import type { FreshnessState } from "@/lib/data-policy";

/**
 * PUBLIC PRICE CATALOG (Milestone 6 — FairPrice, read side)
 * ---------------------------------------------------------
 * A "current price" is not one number. Every public record keeps its type
 * (OFFICIAL / LIVE_QUOTE / RECENT_OBSERVATION / TYPICAL_RANGE / ESTIMATE /
 * USER_REPORT), its category, validity window and provenance. Only records a
 * reviewer has promoted to a live verification status (VERIFIED / LIVE) are
 * shown publicly; USER_REPORTED / ESTIMATED / PREDICTED / DEMO records never
 * surface as if they were current facts. Estimates live in `price_forecasts`
 * and are kept separate (see DATA_TRUTH.md).
 */

export const PUBLIC_PRICE_STATUSES = [
  verificationStatusEnum.VERIFIED,
  verificationStatusEnum.LIVE,
] as const;

export interface PublicPrice {
  id: string;
  targetType: string;
  targetId: string;
  category: string;
  priceType: string;
  amount: number;
  amountMax: number | null;
  currency: string;
  description: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  collectedAt: Date;
  verifiedAt: Date | null;
  freshness: FreshnessState;
  source: { id: string; name: string; organizationName: string | null; reliability: string };
}

export interface PriceListOptions {
  category?: string;
  entityId?: string;
}

const priceSelect = {
  id: priceRecords.id,
  targetType: priceRecords.targetType,
  targetId: priceRecords.targetId,
  category: priceRecords.category,
  priceType: priceRecords.priceType,
  amount: priceRecords.amount,
  amountMax: priceRecords.amountMax,
  currency: priceRecords.currency,
  description: priceRecords.description,
  validFrom: priceRecords.validFrom,
  validTo: priceRecords.validTo,
  collectedAt: priceRecords.collectedAt,
  verifiedAt: sourceRecords.verifiedAt,
  sourceId: sourceRecords.dataSourceId,
  sourceName: dataSources.name,
  organizationName: dataSources.organizationName,
  sourceReliability: dataSources.reliability,
} as const;

export async function listPublicPrices(
  db: Database,
  opts: PriceListOptions = {},
): Promise<PublicPrice[]> {
  const conditions = [inArray(priceRecords.verificationStatus, PUBLIC_PRICE_STATUSES)];
  if (opts.category?.trim()) conditions.push(eq(priceRecords.category, opts.category.trim()));
  if (opts.entityId?.trim()) {
    conditions.push(
      and(
        eq(priceRecords.targetType, "attraction"),
        eq(priceRecords.targetId, opts.entityId.trim()),
      )!,
    );
  }

  const rows = await db
    .select(priceSelect)
    .from(priceRecords)
    .innerJoin(sourceRecords, eq(priceRecords.sourceRecordId, sourceRecords.id))
    .innerJoin(dataSources, eq(sourceRecords.dataSourceId, dataSources.id))
    .where(and(...conditions))
    .orderBy(asc(priceRecords.category), asc(priceRecords.amount));

  return rows.map((r) => toPublicPrice(r));
}

interface PriceRow {
  id: string;
  targetType: string;
  targetId: string;
  category: string;
  priceType: string;
  amount: string;
  amountMax: string | null;
  currency: string;
  description: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  collectedAt: Date;
  verifiedAt: Date | null;
  sourceId: string;
  sourceName: string;
  organizationName: string | null;
  sourceReliability: string;
}

function toPublicPrice(row: PriceRow): PublicPrice {
  const amount = Number(row.amount);
  const amountMax = row.amountMax != null ? Number(row.amountMax) : null;
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    category: row.category,
    priceType: row.priceType,
    amount: Number.isFinite(amount) ? amount : 0,
    amountMax: amountMax != null && Number.isFinite(amountMax) ? amountMax : null,
    currency: row.currency,
    description: row.description ?? null,
    validFrom: row.validFrom ?? null,
    validTo: row.validTo ?? null,
    collectedAt: row.collectedAt,
    verifiedAt: row.verifiedAt,
    freshness: freshnessState({
      verifiedAt: row.verifiedAt,
      validFrom: row.validFrom,
      validUntil: row.validTo,
      freshnessClass: "price",
    }),
    source: {
      id: row.sourceId,
      name: row.sourceName,
      organizationName: row.organizationName ?? null,
      reliability: row.sourceReliability,
    },
  };
}

export async function listPriceCategories(db: Database): Promise<string[]> {
  const rows = await db
    .select({ category: priceRecords.category })
    .from(priceRecords)
    .where(inArray(priceRecords.verificationStatus, PUBLIC_PRICE_STATUSES));
  return [...new Set(rows.map((r) => r.category))].sort();
}

export function formatPrice(amount: number, currency: string): string {
  if (currency === "INR") return `₹${amount.toLocaleString("en-IN")}`;
  return `${amount.toLocaleString("en-IN")} ${currency}`;
}
