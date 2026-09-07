import type { Metadata } from "next";
import { Navigation } from "lucide-react";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Nearby",
  description: "Verified destinations near a chosen place.",
};

export default async function NearbyPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Explore"
        title="Nearby"
        description="Verified destinations within a chosen radius of a place you pick. Distances are computed only from approved coordinates — never guessed positions."
        icon={<Navigation className="h-5 w-5" aria-hidden="true" />}
      />

      <DataTrustNotice message="Hotels, restaurants, transport and emergency services have no approved coordinates yet, so nearby currently covers verified destinations only." />

      <EmptyState
        title="Nearby preview"
        description="Run the project locally with PostgreSQL to see verified destinations near your chosen location."
        icon={<Navigation className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
