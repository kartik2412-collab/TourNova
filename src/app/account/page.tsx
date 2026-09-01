import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentSession, publicUser } from "@/lib/auth/auth-service";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";
import { SessionManager } from "@/components/account/session-manager";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Account",
};

export default async function AccountPage() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value ?? null;
  const ctx = token ? await getCurrentSession(db, token) : null;
  if (!ctx) redirect("/signin");

  const { role } = ctx.user;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">Account</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {ctx.user.name || ctx.user.email}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{ctx.user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            color={
              role === "ADMIN"
                ? "destructive"
                : role === "AUTHORITY"
                  ? "info"
                  : role === "BUSINESS"
                    ? "warning"
                    : "default"
            }
          >
            {role}
          </Badge>
          <SignOutButton />
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Trust &amp; data controls</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Any data you submit is labelled USER-REPORTED until a reviewer verifies it. You are
          responsible for what you submit — it is never presented as verified simply because it came
          from your account.
        </p>
      </section>

      {roleHasPermission(role, permissions.REVIEW_VERIFICATIONS) ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/review"
            className="rounded-lg border border-border bg-card p-6 shadow-sm transition-colors hover:bg-muted"
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-accent">Workflow</p>
            <h2 className="mt-1 text-lg font-semibold">Verification queue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review user reports, approve or reject, resolve conflicts, publish.
            </p>
          </Link>
          {roleHasPermission(role, permissions.MANAGE_DATA_SOURCES) ? (
            <Link
              href="/admin/sources"
              className="rounded-lg border border-border bg-card p-6 shadow-sm transition-colors hover:bg-muted"
            >
              <p className="text-sm font-semibold uppercase tracking-wide text-accent">Admin</p>
              <h2 className="mt-1 text-lg font-semibold">Source registry</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Register and confirm the classification of information sources.
              </p>
            </Link>
          ) : null}
        </section>
      ) : null}

      {roleHasPermission(role, permissions.MANAGE_USERS) ? (
        <Link
          href="/admin/users"
          className="rounded-lg border border-border bg-card p-6 shadow-sm transition-colors hover:bg-muted"
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-accent">Admin</p>
          <h2 className="mt-1 text-lg font-semibold">User directory</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Grant roles and manage account activity.
          </p>
        </Link>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-semibold tracking-tight">Active sessions</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Devices currently signed in to this account. If you spot one you do not recognise, end it
          immediately.
        </p>
        <div className="mt-4">
          <SessionManager mode="list" />
        </div>
      </section>

      <p className="text-xs text-muted-foreground">Account id: {publicUser(ctx.user).id}</p>
    </div>
  );
}
