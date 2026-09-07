import type { Metadata } from "next";
import { Search } from "lucide-react";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Discover",
  description: "Verified tourism destinations in Gujarat.",
};

export default function DiscoverPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Explore"
        title="Discover destinations"
        description="Human-verified destinations from official sources. Each card shows its source and freshness; a value we have not yet verified is never shown as fact."
        icon={<Search className="h-5 w-5" aria-hidden="true" />}
      />

      <DataTrustNotice message="Only human-approved, sourced destinations appear here. Unverified candidates stay in review until a reviewer decides them — browsing never shows invented facts." />

      <EmptyState
        title="No verified destinations yet"
        description="Destinations appear here only after a reviewer approves a sourced candidate. Run locally with PostgreSQL to see live data."
        icon={<Search className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
