import type { Metadata } from "next";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { listPublicCrowd } from "@/lib/catalog/crowd";
import { CrowdCard } from "@/components/catalog/crowd-card";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { CrowdReportForm } from "@/components/catalog/crowd-report-form";
import { PageHeader } from "@/components/shared/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Crowd Intelligence",
  description:
    "Real-time, verified crowd levels at destinations from authorized counters, transparent sensors, and reviewed observations.",
};

export default async function CrowdPage({
  searchParams,
}: {
  searchParams: Promise<{ entityId?: string }>;
}) {
  const params = await searchParams;
  const observations = await listPublicCrowd(db, { entityId: params.entityId ?? "" });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Crowd Intelligence"
        title="Verified destination crowd levels"
        description="Every crowd observation shown here comes from an authorized counter, transparent sensor feed, or a reviewed community report. Unverified claims and speculative numbers are never shown as current facts."
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
      />

      <DataTrustNotice message="No verified crowd data exists yet. Authorized counts and reviewed community reports will appear here as they are collected and verified. Unverified crowd reports stay in review until approved and are never shown as current facts." />

      <CrowdReportForm />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {observations.length} verified crowd observation{observations.length === 1 ? "" : "s"}.
        </p>
      </div>

      {observations.length === 0 ? (
        <EmptyState
          title="No verified crowd information is currently available."
          description="Sourced, reviewed crowd observations will appear here. Until then no crowd level is shown — not even a guessed or placeholder figure."
          icon={<Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {observations.map((obs) => (
            <CrowdCard key={obs.id} observation={obs} />
          ))}
        </div>
      )}
    </div>
  );
}
