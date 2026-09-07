import type { Metadata } from "next";
import { Database } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";

export const metadata: Metadata = {
  title: "Source Registry",
};

export default function SourcesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Source Registry"
        description="Manage data sources and their reliability classifications."
        icon={<Database className="h-5 w-5" aria-hidden="true" />}
      />
      <EmptyState
        title="Preview mode"
        description="Run locally with PostgreSQL to access the source registry."
        icon={<Database className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
