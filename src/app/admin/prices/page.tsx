import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/auth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";
import { PriceReview } from "@/components/admin/price-review";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Price report review",
  description: "Review and decide community-submitted price reports.",
};

export default async function AdminPricesPage() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  const ctx = token ? await getCurrentSession(db, token) : null;
  if (!ctx) redirect("/signin");
  if (!roleHasPermission(ctx.user.role, permissions.REVIEW_VERIFICATIONS)) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Price report review</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Community price reports land here as USER_REPORTED claims tied to their submitter source.
          Approving one promotes the claim through the trust workflow to VERIFIED, the only state
          the public FairPrice page shows. Rejected, reopened or unavailable reports never surface.
        </p>
      </div>
      <PriceReview />
    </div>
  );
}
