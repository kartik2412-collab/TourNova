import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "Review",
  description: "Verification queue for user reports and data submissions.",
};

export default function ReviewPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6">
      <PageHeader
        eyebrow="Review"
        title="Verification queue"
        description="Decide how each submission enters the platform. Approving verifies it; publishing makes it live to travellers."
        icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />}
      />

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold tracking-tight">Reviewer access required</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The verification queue requires an authenticated reviewer account. Run the project locally
          with PostgreSQL to access the full review workflow including submission approval, conflict
          resolution, and data publishing.
        </p>
        <Link
          href="/signin"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
        >
          Sign in as Reviewer
        </Link>
      </div>
    </div>
  );
}
