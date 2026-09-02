import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/auth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";
import { IngestionReview } from "@/components/admin/ingestion-review";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Ingestion review",
  description: "Review and decide sourced ingestion candidates.",
};

export default async function AdminIngestionPage() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  const ctx = token ? await getCurrentSession(db, token) : null;
  if (!ctx) redirect("/signin");
  if (!roleHasPermission(ctx.user.role, permissions.MANAGE_INGESTION)) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ingestion review</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Candidates fetched by the sourced ingestion pipeline land here as PENDING_REVIEW with
          their source, collected time and per-field diff. Every decision is made by a human;
          nothing gets trusted merely because it came from a website. Batch decisions are
          all-or-nothing — if any item fails, nothing changes.
        </p>
      </div>
      <IngestionReview />
    </div>
  );
}
