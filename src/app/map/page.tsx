import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = {
  title: "Map",
  description:
    "Interactive map of destinations, nearby services and routes. Map provider is abstracted so it can be swapped later.",
};

export default function MapPage() {
  return (
    <ModulePlaceholder
      title="Map"
      description="Interactive maps for discovery, navigation handoff and nearby services — location-aware and provider-agnostic."
      capabilities={[
        {
          title: "Provider-agnostic map layer",
          note: "The map provider is abstracted so it can be swapped (e.g. OpenStreetMap today, an India-optimised provider later) without touching other modules.",
        },
        {
          title: "Destinations & services",
          note: "Destination locations, attractions and businesses rendered from verified geodata records.",
        },
        {
          title: "Navigation handoff",
          note: "Distance, routes and one-tap handoff to the platform's own navigation app. TourNova does not build its own turn-by-turn engine.",
        },
      ]}
    />
  );
}
