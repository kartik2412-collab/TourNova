import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "FairPrice",
  description:
    "Know the price before you pay. Transparent, sourced price information for tickets, transport, hotels, food and services.",
};

export default async function FairPricePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="FairPrice"
        title="Know the price before you pay"
        description="Every price here is a sourced record with a type, a validity window, and provenance. A single universal current price is never invented."
        icon={<Banknote className="h-5 w-5" aria-hidden="true" />}
      />

      <DataTrustNotice message="No verified prices exist yet. Official/authority-declared prices and verified observations will appear here as they are collected and reviewed." />

      <EmptyState
        title="FairPrice preview"
        description="Run the project locally with PostgreSQL to see sourced, verified price records."
        icon={<Banknote className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
