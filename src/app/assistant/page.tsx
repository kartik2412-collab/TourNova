import type { Metadata } from "next";
import { ModulePlaceholder } from "@/components/shared/module-placeholder";

export const metadata: Metadata = {
  title: "AI Assistant",
  description:
    "Ask about destinations, prices and crowds. Answers are grounded in trusted platform data, with sources shown.",
};

export default function AssistantPage() {
  return (
    <ModulePlaceholder
      title="AI Assistant"
      description="A truthful tourism assistant for India. Retrieves trusted data, cites sources and never invents facts."
      capabilities={[
        {
          title: "RAG on trusted data",
          note: "User question → retrieval over verified platform records → LLM synthesis → answer with sources shown. The AI is never the source of truth.",
        },
        {
          title: "Source transparency",
          note: "Every answer that rests on a factual claim shows the underlying data status (VERIFIED / LIVE / ESTIMATED / …) and where it came from.",
        },
        {
          title: "Resisting hallucination",
          note: "Where no trusted information exists, the assistant says 'Reliable data unavailable' instead of guessing.",
        },
        {
          title: "Multilingual path",
          note: "Designed to extend to Indian languages, mirroring the generic (non Gujarat-specific) data architecture.",
        },
      ]}
    />
  );
}
