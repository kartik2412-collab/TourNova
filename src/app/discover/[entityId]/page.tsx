import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getVerifiedDestination } from "@/lib/catalog/discover";
import { freshnessBadge } from "@/lib/catalog/freshness-badge";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function DestinationDetailPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = await params;
  const destination = await getVerifiedDestination(db, entityId);
  if (!destination) notFound();

  const title = destination.name ?? destination.entityId;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Discover</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {destination.category ? (
            <span className="rounded-full bg-muted px-2 py-0.5">{destination.category}</span>
          ) : null}
          {destination.districtName ? (
            <span className="rounded-full bg-muted px-2 py-0.5">{destination.districtName}</span>
          ) : null}
          {destination.locality ? <span>· {destination.locality}</span> : null}
          <span className={`ml-1 ${freshnessBadge(destination.freshness)}`}>
            Freshness: {destination.freshness}
          </span>
        </div>
      </div>

      {destination.description ? (
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {destination.description}
        </p>
      ) : (
        <DataTrustNotice message="Reliable data unavailable. The source did not provide a description for this destination, and TourNova does not write invented copy." />
      )}

      {destination.conflicts.length > 0 ? (
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-warning">Open contradiction between sources</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Two official sources disagree about this destination. The values are shown side-by-side
            until a reviewer resolves the conflict — we never silently pick one.
          </p>
          {destination.conflicts.map((c, i) => (
            <div key={i} className="mt-2 flex flex-col gap-1 rounded-md bg-muted/40 p-2 text-xs">
              <span>Source A: {c.valueA ?? "—"}</span>
              <span>Source B: {c.valueB ?? "—"}</span>
            </div>
          ))}
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-4">
          <h2 className="text-sm font-semibold">Location</h2>
          {destination.coordinates.length > 0 ? (
            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
              {destination.coordinates.map((c, i) => (
                <li key={i} className="space-y-0.5">
                  <p className="text-foreground">
                    {c.placeName ?? destination.name ?? destination.entityId}
                  </p>
                  <p className="font-mono text-xs">
                    {c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}
                  </p>
                  {c.attribution ? <p className="text-xs">{c.attribution}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs italic text-muted-foreground">
              No approved coordinate yet. TourNova does not guess positions.
            </p>
          )}
          <a href="/map" className="mt-3 inline-block text-xs text-accent underline">
            View on the map →
          </a>
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold">Provenance</h2>
          <dl className="mt-2 space-y-1.5 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="text-right font-medium">{destination.source.name}</dd>
            </div>
            {destination.source.organizationName ? (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Organization</dt>
                <dd className="text-right font-medium">{destination.source.organizationName}</dd>
              </div>
            ) : null}
            {destination.source.sourceType ? (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Type</dt>
                <dd className="text-right font-medium">{destination.source.sourceType}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Reliability</dt>
              <dd className="text-right font-medium">{destination.source.reliability}</dd>
            </div>
            {destination.verifiedAt ? (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Verified</dt>
                <dd className="text-right font-medium">
                  {destination.verifiedAt.toISOString().slice(0, 10)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Collected</dt>
              <dd className="text-right font-medium">
                {destination.collectedAt.toISOString().slice(0, 10)}
              </dd>
            </div>
          </dl>
          {destination.referenceUrl ? (
            <a
              href={destination.referenceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block break-all text-xs text-accent underline"
            >
              {destination.referenceUrl} ↗
            </a>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entityId: string }>;
}): Promise<Metadata> {
  const { entityId } = await params;
  const destination = await getVerifiedDestination(db, entityId);
  if (!destination) return { title: "Destination not found" };
  return { title: destination.name ?? entityId, description: "Verified destination details." };
}
