import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Map",
  description: "Verified destinations on a map.",
};

export default async function MapPage() {
  let data: { points: unknown[]; verifiedDestinationCount: number; pendingCandidatesCount: number } = { points: [], verifiedDestinationCount: 0, pendingCandidatesCount: 0 };
  let provider: unknown = null;

  try {
    const { db } = await import("@/lib/db");
    const { loadMapPageData } = await import("@/lib/catalog/map-data");
    const { resolveMapProvider } = await import("@/lib/geo/map-provider");
    data = await loadMapPageData(db);
    provider = resolveMapProvider();
  } catch {
    // Database not available in static export
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Explore"
        title="Verified destinations"
        description="Every pin on this map is an approved coordinate: sourced from an official document or survey, then reviewed by a human. Nothing is guessed, interpolated, or invented."
        icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
      />

      <DataTrustNotice message="Reliable data unavailable where not shown. Pins appear only after a coordinate candidate is approved — nothing is auto-published from a website or geocoder." />

      <div className="flex flex-col gap-3">
        <EmptyState
          title="Map preview"
          description="Run the project locally with PostgreSQL to see the interactive map with verified destination pins."
          icon={<MapPin className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
        />
      </div>
    </div>
  );
}
