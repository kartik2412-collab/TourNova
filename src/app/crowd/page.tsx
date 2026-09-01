import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = {
  title: "Crowd",
  description:
    "Crowd levels at destinations from authorized counters, estimated signals and transparent model forecasts.",
};

export default function CrowdPage() {
  return (
    <ModulePlaceholder
      title="Crowd"
      description="Crowd intelligence at destinations: authoritative counts, honest estimates and clearly-labelled forecasts."
      showDataNotice
      capabilities={[
        {
          title: "Authoritative counts",
          note: "Exact crowd numbers are only ever shown when an authorised counter, sensor or camera-processing system provides them.",
        },
        {
          title: "Honest estimates",
          note: "Estimated current crowd is calculated from legitimate signals and labelled as an estimate — never passed off as an exact number.",
        },
        {
          title: "Transparent forecasts",
          note: "Predicted crowd uses historical data, events, holidays and seasonality. Forecasts are always labelled PREDICTED, with the model version that produced them.",
        },
        {
          title: "Prototype data honesty",
          note: "For the SIH prototype, any recorded or simulated footage is clearly labelled DEMO/SIMULATION. Simulated data is never presented as live.",
        },
      ]}
    />
  );
}
