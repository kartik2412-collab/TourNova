import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/auth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";
import { SourceManager } from "@/components/admin/source-manager";
import { SourceConflicts } from "@/components/admin/source-conflicts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Sources",
  description: "Administer the sources that back TourNova data.",
};

export default async function AdminSourcesPage() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  const ctx = token ? await getCurrentSession(db, token) : null;
  if (!ctx) redirect("/signin");
  if (!roleHasPermission(ctx.user.role, permissions.MANAGE_DATA_SOURCES)) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Source registry</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Every piece of data on TourNova traces back to a source. A source claims a classification;
          an administrator confirms it before the source can ever be trusted or published.
        </p>
      </div>
      <SourceManager />
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Source conflicts</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Registered disagreements between source records. Resolved by a human; never merged
          silently.
        </p>
      </div>
      <SourceConflicts />
    </div>
  );
}
