import type { Metadata } from "next";
import { db } from "@/lib/db";
import { loadApprovedLocations } from "@/lib/catalog/map-data";
import { formatKm, haversineMeters } from "@/lib/geo/distance";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Nearby",
  description: "Verified destinations near a chosen place.",
};

const RADII_KM = [5, 10, 25, 50, 100];

export default async function NearbyPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; radius?: string }>;
}) {
  const params = await searchParams;
  const locations = await loadApprovedLocations(db);

  const radiusKm = Math.min(100, Math.max(1, Number(params.radius) || 25));
  const from = params.from ?? "";
  const origin = locations.find((l) => l.entityId === from && from !== "") ?? null;

  let results: {
    entityId: string;
    name: string;
    category: string | null;
    distanceMeters: number;
  }[] = [];
  if (origin) {
    results = locations
      .filter((l) => l.entityId !== origin.entityId)
      .map((l) => ({
        entityId: l.entityId,
        name: l.name,
        category: l.category,
        distanceMeters: haversineMeters(origin, l),
      }))
      .filter((r) => Number.isFinite(r.distanceMeters) && r.distanceMeters <= radiusKm * 1000)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Explore</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Nearby</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Verified destinations within a chosen radius of a place you pick. Distances are computed
          only from approved coordinates — never guessed positions.
        </p>
      </div>

      <DataTrustNotice message="Hotels, restaurants, transport and emergency services have no approved coordinates yet, so “nearby” currently covers verified destinations only. The list populates as reviewers approve coordinates." />

      <form
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-muted-foreground">From</span>
          <select
            name="from"
            defaultValue={origin?.entityId ?? ""}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Select a verified destination —</option>
            {locations.map((l) => (
              <option key={l.entityId} value={l.entityId}>
                {l.name}
                {l.districtName ? ` (${l.districtName})` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Radius</span>
          <select
            name="radius"
            defaultValue={String(radiusKm)}
            className="h-10 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {RADII_KM.map((r) => (
              <option key={r} value={r}>
                {r} km
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Search
        </button>
      </form>

      {locations.length === 0 ? (
        <EmptyState
          title="No approved coordinates yet"
          description="Choose a place and distances will appear once reviewers approve coordinates for the verified destinations."
        />
      ) : !origin ? (
        <EmptyState
          title="Choose a starting place"
          description="Select a verified destination above and a radius, then search. Distances are computed only from approved coordinates."
        />
      ) : results.length === 0 ? (
        <EmptyState
          title={`Nothing within ${radiusKm} km`}
          description={`No other verified destinations are within ${radiusKm} km of ${origin.name} (straight-line, from approved coordinates).`}
        />
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {results.map((r, i) => (
            <li key={r.entityId}>
              <Card className="p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-medium">
                      {i + 1}. {r.name}
                    </p>
                    {r.category ? (
                      <p className="text-xs text-muted-foreground">{r.category}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {formatKm(r.distanceMeters)}
                    </span>
                    <a
                      href={`/discover/${encodeURIComponent(r.entityId)}`}
                      className="text-xs text-accent underline"
                    >
                      Details →
                    </a>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {origin ? (
        <p className="text-xs text-muted-foreground">
          Straight-line distances from approved candidate coordinates. Road/travel distance is not
          estimated from guessed geometry.
        </p>
      ) : null}
    </div>
  );
}
