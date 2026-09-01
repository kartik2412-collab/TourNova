import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = {
  title: "Nearby",
  description:
    "Find hotels, hospitals, restaurants, parking and ATMs near you or near a destination.",
};

export default function NearbyPage() {
  return (
    <ModulePlaceholder
      title="Nearby"
      description="Location-aware discovery: hotels, hospitals, restaurants, parking, ATMs and more — near me, or near a destination."
      capabilities={[
        {
          title: "Location-aware queries",
          note: "Uses geospatially-optimised database queries so 'hospitals near this destination' and 'parking near this attraction' are fast and accurate.",
        },
        {
          title: "Privacy-conscious",
          note: "Location is only used with consent and never stored longer than necessary for the requested search.",
        },
        {
          title: "Verified service data",
          note: "Listings come from the verified business and service catalogue, with contact details only shown when verified.",
        },
      ]}
    />
  );
}
