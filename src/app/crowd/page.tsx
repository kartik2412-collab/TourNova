import type { Metadata } from "next";
import { Users } from "lucide-react";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Crowd Intelligence",
  description:
    "Real-time, verified crowd levels at destinations from authorized counters, transparent sensors, and reviewed observations.",
};

export default async function CrowdPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6">
      <PageHeader
        eyebrow="Crowd Intelligence"
        title="Verified destination crowd levels"
        description="Every crowd observation shown here comes from an authorized counter, transparent sensor feed, or a reviewed community report."
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
      />

      <DataTrustNotice message="No verified crowd data exists yet. Authorized counts and reviewed community reports will appear here as they are collected and verified." />

      <EmptyState
        title="Crowd Intelligence preview"
        description="Run the project locally with PostgreSQL to see verified crowd observations."
        icon={<Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
