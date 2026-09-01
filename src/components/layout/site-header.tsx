"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, TentTree } from "lucide-react";
import { useSession } from "@/lib/use-session";
import { roleHasPermission, permissions } from "@/lib/auth/permissions";

/**
 * Site header with responsive navigation.
 * - Desktop: horizontal nav links.
 * - Mobile: accessible hamburger menu with labelled toggle.
 * - Auth-aware: shows Sign in / account controls plus reviewer/admin entries
 *   for the roles that hold those permissions.
 * Active route is highlighted for orientation.
 */

const navLinks = [
  { label: "Discover", href: "/discover" },
  { label: "Map", href: "/map" },
  { label: "Plan", href: "/plan" },
  { label: "FairPrice", href: "/fairprice" },
  { label: "Crowd", href: "/crowd" },
  { label: "Nearby", href: "/nearby" },
  { label: "Emergency", href: "/emergency" },
  { label: "AI Assistant", href: "/assistant" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { loading, authenticated, user, refresh } = useSession();

  const canReview = user != null && roleHasPermission(user.role, permissions.REVIEW_VERIFICATIONS);
  const canAdmin = user != null && roleHasPermission(user.role, permissions.MANAGE_USERS);
  const canManageSources =
    user != null && roleHasPermission(user.role, permissions.MANAGE_DATA_SOURCES);

  const accountHref = user ? "/account" : "/signin";

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
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-ring"
        >
          <TentTree className="h-6 w-6 text-primary" aria-hidden="true" />
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
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
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
          {!loading ? (
            authenticated ? (
              <Link
                href={accountHref}
                aria-label="Account"
                title={user?.email ?? "Account"}
                className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{user?.name ?? "Account"}</span>
              </Link>
            ) : (
              <Link
                href="/signin"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
              >
                Sign in
              </Link>
            )
          ) : null}

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted lg:hidden focus-visible:outline-2 focus-visible:outline-ring"
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
            {authLinks.map((link) => (
              <li key={link.href}>
                <Link
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
              </li>
            ))}
            {authenticated ? (
              <li>
                <Link
                  href="/account"
                  onClick={() => {
                    void refresh();
                    setOpen(false);
                  }}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {user?.email ?? "Account"}
                </Link>
              </li>
            ) : (
              <li>
                <Link
                  href="/signin"
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium text-primary"
                >
                  Sign in
                </Link>
              </li>
            )}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
