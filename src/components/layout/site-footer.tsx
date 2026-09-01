import Link from "next/link";

/**
 * Site footer with the data-truth pledge and minimal navigation.
 */
export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <p className="text-lg font-semibold tracking-tight">
            Tour<span className="text-primary">Nova</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Intelligent tourism and travel intelligence for India — truthful, sourced, and
            verifiable data, from the first pilot state onward.
          </p>
        </div>
        <nav aria-label="Modules">
          <p className="text-sm font-semibold">Explore</p>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link
                href="/discover"
                className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                Discover
              </Link>
            </li>
            <li>
              <Link
                href="/fairprice"
                className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                FairPrice
              </Link>
            </li>
            <li>
              <Link
                href="/crowd"
                className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                Crowd
              </Link>
            </li>
            <li>
              <Link
                href="/emergency"
                className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                Emergency
              </Link>
            </li>
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold">Data truth</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            TourNova never fabricates factual tourism information. Values shown are sourced,
            verified, estimated, predicted or user-reported — never invented.
          </p>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} TourNova. Pilot region: Gujarat, India.
      </div>
    </footer>
  );
}
