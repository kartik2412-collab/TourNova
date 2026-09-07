import type { Metadata } from "next";
import { Database } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";

export const metadata: Metadata = {
  title: "Ingestion Review",
};

export default function IngestionPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Ingestion Review"
        description="Review and approve staged ingestion candidates from data sources."
        icon={<Database className="h-5 w-5" aria-hidden="true" />}
      />
      <EmptyState
        title="Preview mode"
        description="Run locally with PostgreSQL to access the full ingestion review queue."
        icon={<Database className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
