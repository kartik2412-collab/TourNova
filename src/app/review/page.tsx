import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/auth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";
import { ReviewPanel } from "@/components/review/review-panel";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Review",
  description: "Verification queue for user reports and data submissions.",
};

export default async function ReviewPage() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  const ctx = token ? await getCurrentSession(db, token) : null;
  if (!ctx) redirect("/signin");
  if (!roleHasPermission(ctx.user.role, permissions.REVIEW_VERIFICATIONS)) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Review</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Verification queue</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Decide how each submission enters the platform. Approving verifies it; publishing makes it
          live to travellers; flagging a conflict holds both sides open until resolved.
        </p>
      </div>
      <ReviewPanel />
    </div>
  );
}
