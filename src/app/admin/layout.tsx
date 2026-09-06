import type { ReactNode } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/auth/auth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const dynamic = "force-dynamic";

/**
 * Admin shell. Authenticates the viewer and renders a permission-aware nav.
 * Each child page still enforces its own required permission — the layout only
 * brands the section and exposes links the viewer is actually allowed to use.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  const ctx = token ? await getCurrentSession(db, token) : null;
  if (!ctx) redirect("/signin");

  const canManageIngestion = roleHasPermission(ctx.user.role, permissions.MANAGE_INGESTION);
  const canManageSources = roleHasPermission(ctx.user.role, permissions.MANAGE_DATA_SOURCES);
  const canManageUsers = roleHasPermission(ctx.user.role, permissions.MANAGE_USERS);
  const canReview = roleHasPermission(ctx.user.role, permissions.REVIEW_VERIFICATIONS);

  const links = [
    { href: "/admin", label: "Command Center", show: canManageIngestion },
    { href: "/admin/ingestion", label: "Ingestion", show: canManageIngestion },
    { href: "/admin/sources", label: "Sources", show: canManageSources },
    { href: "/admin/prices", label: "Prices", show: canReview },
    { href: "/admin/crowd", label: "Crowd", show: canReview },
    { href: "/admin/users", label: "Users", show: canManageUsers },
  ].filter((l) => l.show);

  const canReachAnything = canManageIngestion || canManageSources || canManageUsers || canReview;

  if (!canReachAnything) redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover text-primary-foreground">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Admin Command Center</h1>
              <p className="text-xs text-muted-foreground">
                Signed in as {ctx.user.name ?? ctx.user.email} ({ctx.user.role})
              </p>
            </div>
          </div>
          <SignOutButton />
        </div>
        <nav aria-label="Admin" className="flex flex-wrap items-center gap-1.5">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
