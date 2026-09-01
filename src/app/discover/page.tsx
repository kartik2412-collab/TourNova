import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = {
  title: "Discover",
  description:
    "Browse destinations and attractions across India. Data becomes available as it is sourced and verified.",
};

export default function DiscoverPage() {
  return (
    <ModulePlaceholder
      title="Discover"
      description="Discover destinations, attractions and experiences across India — searchable and informative. The first populated data region is Gujarat."
      capabilities={[
        {
          title: "Destination directory",
          note: "Countries, states, regions, districts, destinations and attractions stored as geographic data records, not hardcoded pages.",
        },
        {
          title: "Sourced descriptions",
          note: "Every attraction profile shows where its information came from and when it was last verified. Unknown facts are marked UNAVAILABLE.",
        },
        {
          title: "Search & filter",
          note: "Keyword search, category filters and region filters once the data ingestion pipeline is live.",
        },
      ]}
    />
  );
}
