import Link from "next/link";
import { ShieldCheck, Map, Navigation, Banknote, Users } from "lucide-react";

/**
 * Site footer with the data-truth pledge, module links and trust note.
 */
export function SiteFooter() {
  const links = [
    { href: "/discover", label: "Discover", icon: Map },
    { href: "/map", label: "Map", icon: Map },
    { href: "/nearby", label: "Nearby", icon: Navigation },
    { href: "/fairprice", label: "FairPrice", icon: Banknote },
    { href: "/crowd", label: "Crowd", icon: Users },
  ];

  return (
    <footer className="mt-16 border-t border-border bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-base font-extrabold text-white shadow-md shadow-primary/20">
              T
            </span>
            <p className="text-lg font-bold tracking-tight">
              Tour<span className="text-primary">Nova</span>
            </p>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Intelligent tourism and travel intelligence for India — truthful, sourced, and
            verifiable data, from the first pilot state onward.
          </p>
        </div>

        <nav aria-label="Modules">
          <p className="text-sm font-semibold">Explore</p>
          <ul className="mt-3 space-y-2.5 text-sm text-muted-foreground">
            {links.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="inline-flex items-center gap-2 transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="text-sm font-semibold">Data truth</p>
          <p className="mt-3 inline-flex items-start gap-1.5 text-sm leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
            <span>
              TourNova never fabricates factual tourism information. Values shown are sourced,
              verified, estimated, predicted or user-reported — never invented.
            </span>
          </p>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} TourNova. Pilot region: Gujarat, India.
      </div>
    </footer>
  );
}
