"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X, TentTree } from "lucide-react";
import { useSession } from "@/lib/use-session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";

/**
 * Site header with responsive navigation.
 *
 * Auth button visibility:
 * - During SSR and before session loads: the public (unauthenticated) links
 *   (Sign In + Create Account) are shown. This ensures they are in the HTML
 *   immediately — no JS required to discover them.
 * - After session resolves: authenticated users see Account + Sign Out; the
 *   public links are hidden.
 *
 * This is the safe default: showing "Sign In" / "Create Account" to an
 * authenticated user for the ~200ms while the session resolves is harmless
 * and avoids the accessibility bug of hiding auth controls from crawlers and
 * users with JS disabled.
 */

const navLinks = [
  { label: "Discover", href: "/discover" },
  { label: "Map", href: "/map" },
  { label: "Nearby", href: "/nearby" },
  { label: "FairPrice", href: "/fairprice" },
  { label: "Crowd", href: "/crowd" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { authenticated, user, refresh } = useSession();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const canReview = user != null && roleHasPermission(user.role, permissions.REVIEW_VERIFICATIONS);
  const canAdmin = user != null && roleHasPermission(user.role, permissions.MANAGE_USERS);
  const canManageSources =
    user != null && roleHasPermission(user.role, permissions.MANAGE_DATA_SOURCES);

  const authLinks: Array<{ label: string; href: string; active: boolean }> = [
    { label: "Account", href: "/account", active: pathname === "/account" },
  ];
  if (canReview)
    authLinks.push({ label: "Review", href: "/review", active: pathname === "/review" });
  if (canAdmin || canManageSources)
    authLinks.push({
      label: "Admin",
      href: "/admin/sources",
      active: pathname.startsWith("/admin/"),
    });

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-bold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary-hover text-primary-foreground shadow-sm">
            <TentTree className="h-5 w-5" aria-hidden="true" />
          </span>
          <span>
            Tour<span className="text-primary">Nova</span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => {
            const active = pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          {/* Desktop auth: show unauthenticated links by default (SSR-safe),
              authenticated controls only after session resolves. */}
          {authenticated ? (
            <>
              <Link
                href="/account"
                aria-label="Account"
                title={user?.email ?? "Account"}
                className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary-hover text-xs font-bold text-primary-foreground">
                  {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{user?.name ?? "Account"}</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  void refresh();
                }}
                className="hidden h-10 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span className="ml-1.5 hidden sm:inline">Sign out</span>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/signin"
                className="h-10 items-center rounded-lg px-4 text-sm font-semibold text-primary hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-ring sm:inline-flex"
              >
                Create account
              </Link>
            </>
          )}

          {/* Mobile: Sign in button (visible only on small screens when not logged in).
              Once authenticated, the hamburger contains Account + Sign out. */}
          {!authenticated ? (
            <Link
              href="/signin"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-ring sm:hidden"
            >
              Sign in
            </Link>
          ) : null}

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted lg:hidden focus-visible:outline-2 focus-visible:outline-ring"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="border-t border-border bg-background px-4 pb-4 pt-2 lg:hidden"
        >
          <ul className="flex flex-col gap-1">
            {navLinks.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}

            {!authenticated ? (
              <li className="mt-2 flex flex-col gap-2 border-t border-border pt-3">
                <Link
                  href="/signin"
                  onClick={() => setOpen(false)}
                  className="flex h-11 items-center justify-center rounded-lg border-2 border-border text-sm font-semibold text-foreground hover:bg-muted"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => setOpen(false)}
                  className="flex h-11 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover"
                >
                  Create account
                </Link>
              </li>
            ) : (
              <li className="mt-2 flex flex-col gap-1 border-t border-border pt-3">
                {authLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    aria-current={link.active ? "page" : undefined}
                    className={`block rounded-md px-3 py-2.5 text-sm font-medium ${
                      link.active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    void refresh();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out
                </button>
              </li>
            )}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
