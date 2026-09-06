import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin, ShieldCheck, Clock, ExternalLink, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { getVerifiedDestination } from "@/lib/catalog/discover";
import { freshnessBadge } from "@/lib/catalog/freshness-badge";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { Card } from "@/components/ui/card";
import {
  VerificationStatus,
  FreshnessLabel,
  CompletenessIndicator,
} from "@/components/trust/trust-indicators";
import { DestinationImage } from "@/components/visual/destination-image";
import { getPilotImage } from "@/lib/catalog/pilot-images";

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
  const pilot = getPilotImage(destination.entityId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-border">
        <DestinationImage
          entityId={destination.entityId}
          category={destination.category}
          name={title}
          priority
          className="h-52 w-full sm:h-72"
        />
        {pilot?.license && pilot.attribution && pilot.source ? (
          <div className="bg-muted/60 px-4 py-2 text-right text-[11px] leading-tight text-muted-foreground">
            Photo: {pilot.attribution} · {pilot.license} · via {pilot.source}
          </div>
        ) : null}
      </div>

      {/* Title + meta */}
      <div className="px-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
            {destination.category ?? "Uncategorised"}
          </span>
          {destination.districtName ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5">
              <MapPin className="h-3 w-3" aria-hidden="true" />
              {destination.districtName}
            </span>
          ) : null}
          {destination.locality ? (
            <span className="rounded-full bg-muted px-2.5 py-0.5">{destination.locality}</span>
          ) : null}
        </div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <VerificationStatus
            status={
              destination.conflicts.length > 0
                ? "CONFLICT"
                : destination.verifiedAt
                  ? "VERIFIED"
                  : "UNAVAILABLE"
            }
          />
          <FreshnessLabel state={destination.freshness} verifiedAt={destination.verifiedAt} />
          <span
            className={`inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs ${freshnessBadge(
              destination.freshness,
            )}`}
          >
            <Clock className="h-3 w-3" aria-hidden="true" />
            {destination.freshness}
          </span>
        </div>
      </div>

      {/* Description */}
      {destination.description ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Overview
          </h2>
          <p className="mt-2 text-base leading-relaxed text-foreground">
            {destination.description}
          </p>
        </div>
      ) : (
        <DataTrustNotice message="Reliable data unavailable. The source did not provide a description for this destination, and TourNova does not write invented copy." />
      )}

      {/* Conflict warning */}
      {destination.conflicts.length > 0 ? (
        <Card className="border-warning/30 bg-warning/5 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Open contradiction between sources
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Two official sources disagree about this destination. The values are shown side-by-side
            until a reviewer resolves the conflict — we never silently pick one.
          </p>
          {destination.conflicts.map((c, i) => (
            <div key={i} className="mt-2 flex flex-col gap-1 rounded-lg bg-muted/40 p-2.5 text-xs">
              <span>Source A: {c.valueA ?? "—"}</span>
              <span>Source B: {c.valueB ?? "—"}</span>
            </div>
          ))}
        </Card>
      ) : null}

      {/* Quick info + provenance */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-accent" aria-hidden="true" />
            Location
          </h2>
          {destination.coordinates.length > 0 ? (
            <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
              {destination.coordinates.map((c, i) => (
                <li key={i} className="space-y-0.5">
                  <p className="font-medium text-foreground">
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
            <div className="mt-3 flex items-start gap-2 text-xs italic text-muted-foreground">
              <ShieldCheck
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span>No approved coordinate yet. TourNova does not guess positions.</span>
            </div>
          )}
          <a
            href="/map"
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
          >
            View on the map
            <span aria-hidden="true">→</span>
          </a>
        </Card>

        <Card className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            Provenance
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
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
            ) : (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Verified</dt>
                <dd className="text-right text-xs text-muted-foreground">Not yet verified</dd>
              </div>
            )}
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
              className="mt-3 inline-flex max-w-full items-center gap-1 break-all text-xs font-medium text-primary underline underline-offset-2"
            >
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
              View source ({destination.referenceUrl.replace(/^https?:\/\//, "").slice(0, 48)}) ↗
            </a>
          ) : null}
        </Card>
      </div>

      {/* Completeness */}
      <Card className="p-5">
        <CompletenessIndicator
          fields={{
            name: destination.name,
            description: destination.description,
            districtName: destination.districtName,
            locality: destination.locality,
            category: destination.category,
            referenceUrl: destination.referenceUrl,
            latitude: destination.coordinates[0]?.latitude,
            longitude: destination.coordinates[0]?.longitude,
            verifiedAt: destination.verifiedAt,
          }}
        />
      </Card>
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
