import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Users, CreditCard, BarChart3, Settings } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Account",
};

export default function AccountPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
      <PageHeader
        eyebrow="Account"
        title="Your account"
        description="Manage your profile, sessions, and data contributions. Sign in required for full access."
        icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
      />

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Sign in required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Account features require authentication. Run the project locally with PostgreSQL to create
          an account and access session management, data contributions, and role-based permissions.
        </p>
        <Link
          href="/signin"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Go to Sign In
        </Link>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <CreditCard className="h-8 w-8 text-accent" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold">Data Contributions</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit verified price and crowd reports. All submissions are reviewed before publishing.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <BarChart3 className="h-8 w-8 text-accent" aria-hidden="true" />
          <h3 className="mt-3 text-base font-semibold">Activity Tracking</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            View your submission history, verification status, and contribution impact.
          </p>
        </div>
      </section>
    </div>
  );
}
