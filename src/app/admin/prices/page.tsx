import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";

export const metadata: Metadata = {
  title: "Price Management",
};

export default function PricesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Price Management"
        description="Review and manage verified price records."
        icon={<CreditCard className="h-5 w-5" aria-hidden="true" />}
      />
      <EmptyState
        title="Preview mode"
        description="Run locally with PostgreSQL to manage price records."
        icon={<CreditCard className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
