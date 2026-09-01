import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = {
  title: "Plan",
  description: "Build personalised trip itineraries with trusted data behind every recommendation.",
};

export default function PlanPage() {
  return (
    <ModulePlaceholder
      title="Plan"
      description="Plan trips, build itineraries and get personalised recommendations grounded in verified tourism data."
      capabilities={[
        {
          title: "Trip planning",
          note: "Create an itinerary, add destinations and attractions from the verified catalogue, and organise days. The itinerary schema already exists in the database.",
        },
        {
          title: "Personalised suggestions",
          note: "Future AI-assisted recommendations will only draw on trusted, sourced platform data — never invented facts.",
        },
        {
          title: "Share & revisit",
          note: "Plans belong to the traveller's account and can be edited over time.",
        },
      ]}
    />
  );
}
