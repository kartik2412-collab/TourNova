import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = {
  title: "FairPrice",
  description:
    "Know the price before you pay. Transparent price information for tickets, transport, hotels, food and services.",
};

export default function FairPricePage() {
  return (
    <ModulePlaceholder
      title="FairPrice"
      description="Know the price before you pay. Official, quoted, observed and estimated prices — each one clearly labelled and sourced."
      showDataNotice
      capabilities={[
        {
          title: "Official prices",
          note: "Government-declared ticket and fee prices traced to statutory sources, with validity windows.",
        },
        {
          title: "Quotes & observations",
          note: "Live quotes from authorised feeds and recent verifiable observations, never presented as a single universal 'current price'.",
        },
        {
          title: "Typical ranges & estimates",
          note: "Ranges aggregated from reliable records, and model estimates clearly labelled as estimates — never as truth.",
        },
        {
          title: "User reports",
          note: "Community-reported prices are flagged USER_REPORTED and subject to verification before becoming trusted.",
        },
      ]}
    />
  );
}
