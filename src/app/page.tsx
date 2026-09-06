import type { Metadata } from "next";
import Link from "next/link";
import {
  Compass,
  Map,
  MapPin,
  BadgeIndianRupee,
  Users,
  ShieldCheck,
  ArrowRight,
  Mountain,
  TreePine,
  Landmark,
  Sparkles,
  UtensilsCrossed,
  Flower2,
} from "lucide-react";
import { navModules } from "@/lib/navigation";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { SectionHeading } from "@/components/ui/card";
import { CategoryArt } from "@/components/visual/category-art";
import { db } from "@/lib/db";
import { listVerifiedDestinations } from "@/lib/catalog/discover";
import { DestinationCard } from "@/components/catalog/destination-card";

export const metadata: Metadata = {
  title: "TourNova",
  description:
    "Intelligent tourism and travel intelligence for India — truthful, sourced destination, price, crowd and emergency information.",
};

const experiences = [
  {
    title: "Heritage",
    description: "Forts, stepwells, monuments and architectural wonders.",
    category: "heritage",
    href: "/discover?category=heritage",
    icon: Landmark,
  },
  {
    title: "Nature",
    description: "Wildlife sanctuaries, national parks and scenic landscapes.",
    category: "nature",
    href: "/discover?category=nature",
    icon: TreePine,
  },
  {
    title: "Culture",
    description: "Museums, festivals, crafts and living traditions.",
    category: "culture",
    href: "/discover?category=culture",
    icon: Sparkles,
  },
  {
    title: "Spiritual",
    description: "Temples, pilgrim routes and places of quiet reflection.",
    category: "spiritual",
    href: "/discover?category=spiritual",
    icon: Flower2,
  },
  {
    title: "Adventure",
    description: "Hill stations, trekking and outdoor experiences.",
    category: "adventure",
    href: "/discover?category=adventure",
    icon: Mountain,
  },
  {
    title: "Food",
    description: "Markets, food streets and regional culinary traditions.",
    category: "food",
    href: "/discover?category=food",
    icon: UtensilsCrossed,
  },
];

const whyCards = [
  {
    icon: ShieldCheck,
    title: "Verifiable information",
    text: "Every factual value points back to a government source, official body, API feed, verified business or user report. We never invent facts.",
  },
  {
    icon: Compass,
    title: "Transparent sources",
    text: "See exactly where each fact came from, when it was collected and how reliable the source is — right on every destination page.",
  },
  {
    icon: Users,
    title: "Community intelligence",
    text: "Report a recent price or crowd level; reviewed reports become openly visible facts. Untested claims never masquerade as truth.",
  },
  {
    icon: Sparkles,
    title: "Freshness indicators",
    text: "Every value carries a freshness label — verified, live, estimated, user-reported — so you know how current the information is.",
  },
];

const pilotTagline =
  "Monuments, stepwells, wildlife and destinations with human-verified, officially-sourced facts. Only records that cleared human review appear here.";

export default async function Home() {
  const liveModules = navModules.filter((m) => m.status === "live");
  const comingSoon = navModules.filter((m) => m.status === "coming-soon");
  const featured = (await listVerifiedDestinations(db, { limit: 6 })).slice(0, 6);

  return (
    <div>
      {/* ── Hero ── */}
      <section className="hero-gradient relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.4) 0%, transparent 40%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.2) 0%, transparent 35%)",
          }}
          aria-hidden="true"
        />
        <div className="dot-pattern absolute inset-0 opacity-10" aria-hidden="true" />
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 sm:py-32">
          <p className="rounded-full bg-white/10 px-3 py-1 text-sm font-semibold tracking-wider backdrop-blur">
            Built for India · Now exploring Gujarat
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Discover India with{" "}
            <span className="bg-gradient-to-r from-amber-300 to-amber-100 bg-clip-text text-transparent">
              information you can trust
            </span>
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-white/85 sm:text-xl">
            TourNova is travel intelligence for India — destinations, prices, crowd levels and
            emergency assistance, all sourced, verified and clearly labelled. We never invent a fact
            to fill a page.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/discover"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Compass className="h-5 w-5" aria-hidden="true" />
              Explore destinations
            </Link>
            <Link
              href="/map"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-white/30 bg-white/5 px-7 text-base font-semibold text-white backdrop-blur transition-all hover:border-white/50 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Map className="h-5 w-5" aria-hidden="true" />
              Explore the map
            </Link>
          </div>
          <p className="mt-2 text-sm text-white/80">
            Every destination card shows its source and freshness. No invented prices. No guessed
            coordinates.
          </p>
        </div>
      </section>

      {/* ── Explore by experience ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <SectionHeading
          eyebrow="Explore by experience"
          title="What kind of journey?"
          description="Browse by experience — each category is populated only with sourced, human-approved destinations."
        />
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {experiences.map((xp) => (
            <Link
              key={xp.title}
              href={xp.href}
              className="card-interactive group overflow-hidden rounded-xl border border-border bg-card"
            >
              <CategoryArt category={xp.category} className="h-32 w-full" />
              <div className="flex flex-col gap-1.5 p-5">
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <xp.icon className="h-4.5 w-4.5 text-accent" aria-hidden="true" />
                  {xp.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{xp.description}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Explore {xp.title}
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Live modules ── */}
      <section className="section-gradient">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Everything a traveller needs"
            title="Plan the whole trip"
            description="Explore destinations, understand prices, check crowd levels, and find places nearby. Modules being built are clearly marked — never faked."
          />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveModules.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                className="card-interactive group flex flex-col gap-3 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 text-primary">
                    <m.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Live
                  </span>
                </div>
                <h3 className="text-base font-bold">{m.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{m.description}</p>
                <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold text-primary">
                  Open {m.title}
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gujarat pilot ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary via-primary-hover to-teal-800 p-8 text-white sm:p-12">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-300">
            First pilot region
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-bold tracking-tight sm:text-4xl">
            Start exploring Gujarat
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">
            {pilotTagline}
          </p>
          {featured.length > 0 ? (
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((dest) => (
                <DestinationCard key={dest.entityId} destination={dest} />
              ))}
            </div>
          ) : null}
          <div className="mt-8">
            <Link
              href="/discover?district="
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-7 text-base font-semibold text-primary shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <MapPin className="h-5 w-5" aria-hidden="true" />
              Browse Gujarat destinations
            </Link>
          </div>
        </div>
      </section>

      {/* ── Why TourNova ── */}
      <section className="section-gradient">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Why TourNova"
            title="Travel with a truth-first advantage"
            description="Beautiful to browse, honest underneath. The platform is designed so trust is never sacrificed for looks."
          />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whyCards.map((item) => (
              <div
                key={item.title}
                className="card-interactive rounded-xl border border-border bg-card p-5"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent/10 to-accent/5 text-accent">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-3 text-base font-bold">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Map CTA ── */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="grid grid-cols-1 items-center gap-8 rounded-2xl border border-border bg-card p-8 sm:p-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-accent">
              Explore the map
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Places that are truly verified
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Every pin is an approved coordinate sourced from an official document or survey, then
              reviewed by a human. Nothing is guessed or interpolated. Find locations near you with
              straight-line distances from approved data.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/map"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover"
              >
                <Map className="h-4 w-4" aria-hidden="true" />
                Open the map
              </Link>
              <Link
                href="/nearby"
                className="inline-flex h-11 items-center gap-2 rounded-xl border-2 border-border px-5 text-sm font-semibold hover:bg-muted"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Find nearby
              </Link>
            </div>
          </div>
          <div className="relative flex h-56 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-background to-accent/10">
            <div className="dot-pattern absolute inset-0 opacity-40" aria-hidden="true" />
            <Map className="h-20 w-20 text-primary/30" aria-hidden="true" />
            <div className="absolute left-1/4 top-1/3 flex items-center justify-center">
              <span
                className="flex h-3 w-3 rounded-full bg-primary shadow-lg shadow-primary/40"
                aria-hidden="true"
              />
            </div>
            <div className="absolute left-1/2 top-1/2 flex items-center justify-center">
              <span
                className="flex h-3 w-3 rounded-full bg-accent shadow-lg shadow-accent/40"
                aria-hidden="true"
              />
            </div>
            <div className="absolute left-2/3 top-2/3 flex items-center justify-center">
              <span
                className="flex h-3 w-3 rounded-full bg-primary shadow-lg shadow-primary/40"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Community intelligence ── */}
      <section className="section-gradient">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Community intelligence"
            title="Help keep travel facts current"
            description="Spot a recent price or a busy crowd? Tell us. Reviewed reports become live verified facts that help other travellers."
          />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Link
              href="/fairprice"
              className="card-interactive group flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400">
                <BadgeIndianRupee className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold">FairPrice</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Know the price before you pay. Sourced ticket, food, transport and stay prices —
                never guessed, clearly labelled.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Explore prices
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
            <Link
              href="/crowd"
              className="card-interactive group flex flex-col gap-3 rounded-xl border border-border bg-card p-6"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent/15 to-accent/5 text-accent">
                <Users className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold">Crowd Intelligence</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Verified crowd levels from authorized counters and reviewed reports — never
                speculative numbers.
              </p>
              <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Explore crowd levels
                <ArrowRight
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Modules coming soon ── */}
      {comingSoon.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <SectionHeading
            eyebrow="Coming next"
            title="Built foundation-first"
            description="These modules will light up as verified data and architecture become available. Promised features are never faked."
          />
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {comingSoon.map((m) => (
              <div
                key={m.href}
                className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-5 opacity-80"
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <m.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Coming soon
                  </span>
                </div>
                <h3 className="text-base font-bold">{m.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{m.description}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Data truth ── */}
      <section className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading
            eyebrow="Our promise"
            title="No invented data. Ever."
            description="TourNova operates on sourced truth. Where we do not have reliable data, we say so."
          />
          <div className="mt-8">
            <DataTrustNotice />
          </div>
        </div>
      </section>
    </div>
  );
}
