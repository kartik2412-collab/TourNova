import type { Metadata } from "next";
import { MapPin } from "lucide-react";
import { db } from "@/lib/db";
import { loadMapPageData } from "@/lib/catalog/map-data";
import { resolveMapProvider } from "@/lib/geo/map-provider";
import { MapShell } from "@/components/map/map-shell";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Map",
  description: "Verified destinations on a map.",
};

export default async function MapPage() {
  const data = await loadMapPageData(db);
  const provider = resolveMapProvider();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Explore"
        title="Verified destinations"
        description="Every pin on this map is an approved coordinate: sourced from an official document or survey, or resolved by a geocoding provider, then reviewed by a human. Nothing is guessed, interpolated, or invented."
        icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-gradient-to-r from-primary/10 to-primary/5 px-3 py-1.5 font-medium text-primary">
          {data.verifiedDestinationCount} verified locations on the map
        </span>
        <span className="rounded-full bg-muted px-3 py-1.5 text-muted-foreground">
          {data.pendingCandidatesCount} coordinate candidates await review
        </span>
      </div>

      <DataTrustNotice message="Reliable data unavailable where not shown. Pins appear only after a coordinate candidate is approved — nothing is auto-published from a website or geocoder." />

      <div className="flex flex-col gap-3">
        {data.points.length === 0 ? (
          <EmptyState
            title="No verified locations yet"
            description={`No approved coordinates exist yet (${data.pendingCandidatesCount} candidates are in review). The map below will populate only with human-approved pins.`}
            icon={<MapPin className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
          />
        ) : null}
        <MapShell provider={provider} points={data.points} />
      </div>
    </div>
  );
}
