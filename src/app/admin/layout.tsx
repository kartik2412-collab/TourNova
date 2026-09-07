import type { ReactNode } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default async function AdminLayout({ children }: { children: ReactNode }) {
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
                Preview mode — run locally for full admin access
              </p>
            </div>
          </div>
        </div>
        <nav aria-label="Admin" className="flex flex-wrap items-center gap-1.5">
          <Link
            href="/admin"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Overview
          </Link>
          <Link
            href="/signin"
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
          >
            Sign In for Full Access
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
