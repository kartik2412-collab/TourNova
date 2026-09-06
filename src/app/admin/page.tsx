import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/auth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";
import { AdminCommandCenter } from "@/components/admin/admin-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin Command Center",
  description: "Operational overview of the TourNova data pipeline.",
};

export default async function AdminHomePage() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  const ctx = token ? await getCurrentSession(db, token) : null;
  if (!ctx) redirect("/signin");
  if (!roleHasPermission(ctx.user.role, permissions.MANAGE_INGESTION)) redirect("/");

  return <AdminCommandCenter />;
}
