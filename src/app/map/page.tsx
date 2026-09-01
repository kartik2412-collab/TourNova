import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadMapPageData } from "@/lib/catalog/map-data";
import { resolveMapProvider } from "@/lib/geo/map-provider";
import { MapShell } from "@/components/map/map-shell";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Map",
  description: "Verified destinations on a map.",
};

export default async function MapPage() {
  const data = await loadMapPageData(db);
  const provider = resolveMapProvider();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Explore</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Verified destinations</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every pin on this map is an approved coordinate: sourced from an official document or{" "}
          survey, or resolved by a geocoding provider, then reviewed by a human. Nothing is guessed,
          interpolated, or invented.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
          {data.verifiedDestinationCount} verified locations on the map
        </span>
        <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground">
          {data.pendingCandidatesCount} coordinate candidates await review
        </span>
      </div>

      <DataTrustNotice message="Reliable data unavailable where not shown. Pins appear only after a coordinate candidate is approved — nothing is auto-published from a website or geocoder." />

      <div className="flex flex-col gap-3">
        {data.points.length === 0 ? (
          <EmptyState
            title="No verified locations yet"
            description={`No approved coordinates exist yet (${data.pendingCandidatesCount} candidates are in review). The map below will populate only with human-approved pins.`}
          />
        ) : null}
        <MapShell provider={provider} points={data.points} />
      </div>
    </div>
  );
}
