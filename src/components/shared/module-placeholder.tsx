import { DataTrustNotice } from "@/components/shared/data-trust-notice";
import { EmptyState } from "@/components/shared/states";
import { Card, SectionHeading } from "@/components/ui/card";

/**
 * Placeholder page for a tournova module that is architecture-backed but not
 * yet implemented. Intentionally shows no fake facts: data-relevant modules
 * include a DataTrustNotice and an explicit "coming soon" empty state.
 */

interface ModulePlaceholderProps {
  title: string;
  description: string;
  /** Short list of promises for the module (what it WILL do). */
  capabilities: { title: string; note: string }[];
  showDataNotice?: boolean;
  children?: React.ReactNode;
}

export function ModulePlaceholder({
  title,
  description,
  capabilities,
  showDataNotice = true,
  children,
}: ModulePlaceholderProps) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading eyebrow="Module" title={title} description={description} />

      {showDataNotice ? <DataTrustNotice className="mt-8" /> : null}

      <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
        {capabilities.map((cap) => (
          <Card key={cap.title}>
            <h3 className="text-base font-semibold">{cap.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{cap.note}</p>
          </Card>
        ))}
      </div>

      <div className="mt-10 rounded-lg border border-dashed border-border">
        <EmptyState
          title="Coming soon"
          description="This module is in the TourNova foundation and will be implemented next. No placeholder data is shown here."
        />
      </div>

      {children}
    </div>
  );
}
