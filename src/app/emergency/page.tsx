import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = {
  title: "Emergency",
  description:
    "Emergency services and assistance — help hotlines and verified service points, with reliable data only.",
};

export default function EmergencyPage() {
  return (
    <ModulePlaceholder
      title="Emergency"
      description="Emergency assistance for travellers: verified service points and contact numbers — never invented or unverified."
      showDataNotice
      capabilities={[
        {
          title: "Verified service points",
          note: "Hospitals, police, pharmacies and fire services are listed from verifiable records (official directories, government sources) and labelled with their verification status.",
        },
        {
          title: "No fabricated contacts",
          note: "Phone numbers and addresses are only shown when verified against a trusted source. Unknown entries show 'Reliable data unavailable'.",
        },
        {
          title: "Quick access",
          note: "Designed for fast, low-friction access on mobile in stressful situations, including offline-friendly behaviour where possible.",
        },
      ]}
    />
  );
}
