import type { Metadata } from "next";
import { Search } from "lucide-react";
import { db } from "@/lib/db";
import { listDestinationFacets, listVerifiedDestinations } from "@/lib/catalog/discover";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { DestinationCard } from "@/components/catalog/destination-card";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Discover",
  description: "Verified tourism destinations in Gujarat.",
};

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; district?: string }>;
}) {
  const params = await searchParams;
  const [facets, destinations] = await Promise.all([
    listDestinationFacets(db),
    listVerifiedDestinations(db, {
      query: params.q ?? "",
      category: params.category ?? "",
      district: params.district ?? "",
    }),
  ]);

  const hasFilters = Boolean(params.q || params.category || params.district);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      {/* Page header */}
      <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/5 via-background to-accent/5 p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Explore</p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Discover destinations</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Human-verified destinations from official sources. Each card shows its source and
          freshness; a value we have not yet verified is never shown as fact.
        </p>
      </div>

      <DataTrustNotice message="Only human-approved, sourced destinations appear here. Unverified candidates stay in review until a reviewer decides them — browsing never shows invented facts." />

      <CatalogFilters categories={facets.categories} districts={facets.districts} />

      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {destinations.length} verified destination{destinations.length === 1 ? "" : "s"}
        {hasFilters ? " match your filters" : ""}.
      </p>

      {destinations.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No matches" : "No verified destinations yet"}
          description={
            hasFilters
              ? "Nothing has been approved for these filters yet. Try clearing them."
              : "Destinations appear here only after a reviewer approves a sourced candidate. Check back soon."
          }
          icon={<Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((d) => (
            <DestinationCard key={d.entityId} destination={d} />
          ))}
        </div>
      )}
    </div>
  );
}
