import type { Metadata } from "next";
import { db } from "@/lib/db";
import { listPriceCategories, listPublicPrices } from "@/lib/catalog/fairprice";
import { PriceCard } from "@/components/catalog/price-card";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "FairPrice",
  description:
    "Know the price before you pay. Transparent, sourced price information for tickets, transport, hotels, food and services.",
};

export default async function FairPricePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const [categories, prices] = await Promise.all([
    listPriceCategories(db),
    listPublicPrices(db, { category: params.category ?? "" }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">FairPrice</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Know the price before you pay
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every price here is a sourced record with a type (official, quote, observed, range or
          estimate), a validity window, and provenance. A single universal “current price” is never
          invented.
        </p>
      </div>

      <DataTrustNotice message="No verified prices exist yet. Official/authority-declared prices and verified observations will appear here as they are collected and reviewed. Community-reported prices stay in review until verified and are never shown as current facts." />

      <div className="flex flex-wrap items-center gap-3">
        <form method="get" className="flex items-center gap-2">
          <label className="sr-only" htmlFor="price-category">
            Category
          </label>
          <select
            id="price-category"
            name="category"
            defaultValue={params.category ?? ""}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Filter
          </button>
        </form>
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {prices.length} verified price record{prices.length === 1 ? "" : "s"}.
        </p>
      </div>

      {prices.length === 0 ? (
        <EmptyState
          title={categories.length === 0 ? "No verified prices yet" : "No prices in this category"}
          description="Sourced, reviewed price records will appear here. Until then no price is shown — not even a placeholder guess."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {prices.map((p) => (
            <PriceCard key={p.id} price={p} />
          ))}
        </div>
      )}
    </div>
  );
}
