import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/auth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";
import { UserManager } from "@/components/admin/user-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Users",
  description: "Administrative user directory.",
};

export default async function AdminUsersPage() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  const ctx = token ? await getCurrentSession(db, token) : null;
  if (!ctx) redirect("/signin");
  if (!roleHasPermission(ctx.user.role, permissions.MANAGE_USERS)) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-12 sm:px-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">User directory</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Grant roles and manage account activity. Every change is audited with the acting
          administrator.
        </p>
      </div>
      <UserManager />
    </div>
  );
}
