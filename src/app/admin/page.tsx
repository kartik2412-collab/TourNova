import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, BarChart3, Database, Users, FileCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Admin Command Center",
  description: "Operational overview of the TourNova data pipeline.",
};

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Command Center"
        description="Operational overview of the TourNova data pipeline. Full dashboard available with local PostgreSQL setup."
        icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
      />

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold tracking-tight">Admin access required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The admin dashboard requires an authenticated admin account with appropriate permissions.
          Run the project locally with PostgreSQL to access the full command center including
          ingestion management, source registry, user directory, and data quality metrics.
        </p>
        <Link
          href="/signin"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Sign in as Admin
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <BarChart3 className="h-8 w-8 text-accent" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold">Data Pipeline</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Monitor ingestion, review, and publishing workflows.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Database className="h-8 w-8 text-accent" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold">Source Registry</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage data sources and their reliability classifications.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <Users className="h-8 w-8 text-accent" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold">User Directory</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Manage roles, permissions, and account activity.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <FileCheck className="h-8 w-8 text-accent" aria-hidden="true" />
          <h3 className="mt-3 text-sm font-semibold">Audit Log</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Track all administrative actions and data changes.
          </p>
        </div>
      </div>
    </div>
  );
}
