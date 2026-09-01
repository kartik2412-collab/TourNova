import type { Metadata } from "next";
import Link from "next/link";
import { navModules } from "@/lib/navigation";
import { ModuleCard } from "@/components/shared/states";
import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { SectionHeading } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "TourNova",
  description:
    "Intelligent tourism and travel intelligence for India — truthful, sourced destination, price, crowd and emergency information.",
};

const pilotDestinations = [
  "Ahmedabad heritage area",
  "Adalaj Stepwell",
  "Modhera",
  "Patan / Rani Ki Vav",
  "Statue of Unity · Kevadia",
  "Champaner-Pavagadh",
  "Gir",
  "Somnath",
  "Dwarka",
  "Kutch",
  "Saputara",
];

export default function Home() {
  return (
    <div>
      {/* Hero */}
      <section className="border-b border-border bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 sm:py-24">
          <p className="text-sm font-semibold uppercase tracking-wider text-accent">
            Built for India · First pilot: Gujarat
          </p>
          <h1 className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Intelligent tourism, with <span className="text-primary">truthful data</span> you can
            trust.
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            TourNova is a travel intelligence platform built for India — from destination discovery
            and price transparency to crowd levels and emergency assistance. Every factual value is
            sourced, verified or clearly labelled. We never invent prices, crowd counts or opening
            hours.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/discover"
              className="h-12 rounded-md bg-primary px-6 text-base font-medium text-primary-foreground inline-flex items-center justify-center hover:opacity-90"
            >
              Start discovering
            </Link>
            <Link
              href="/assistant"
              className="h-12 rounded-md border border-border bg-transparent px-6 text-base font-medium text-foreground inline-flex items-center justify-center hover:bg-muted"
            >
              Ask the AI Assistant
            </Link>
          </div>
        </div>
      </section>

      {/* Modules */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="Modules"
          title="Everything a traveller needs"
          description="Core modules are being built foundation-first. Modules not yet live are clearly marked as coming soon, and show no fabricated data."
        />
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {navModules.map((m) => (
            <ModuleCard
              key={m.href}
              title={m.title}
              description={m.description}
              href={m.href}
              status={m.status === "live" ? "Live" : "Coming soon"}
              icon={<m.icon className="h-5 w-5" aria-hidden="true" />}
            />
          ))}
        </div>
      </section>

      {/* Pilot destinations */}
      <section className="bg-muted/40">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <SectionHeading
            eyebrow="First data region"
            title="Starting with Gujarat"
            description="These pilot destinations are data records in the platform, not hardcoded architecture. The schema is designed for all of India from day one."
          />
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pilotDestinations.map((name) => (
              <li
                key={name}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-sm font-medium"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                {name}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Data truth */}
      <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <SectionHeading
          eyebrow="Our promise"
          title="No invented data. Ever."
          description="TourNova operates on sourced truth. Where we do not have reliable data, we say so."
        />
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              title: "Sourced",
              text: "Prices, crowd counts, hours and contacts point back to a government source, an official body, an API feed, a verified business or a user report.",
            },
            {
              title: "Verifiable",
              text: "Every important fact keeps provenance — where it came from, when it was collected, when it was last verified and how reliable the source is.",
            },
            {
              title: "Honest statuses",
              text: "Data is labelled VERIFIED, LIVE, ESTIMATED, PREDICTED, USER_REPORTED, DEMO or UNAVAILABLE. Simulated prototype data is never presented as live.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-border bg-card p-6">
              <h3 className="text-base font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <DataTrustNotice />
        </div>
      </section>
    </div>
  );
}
