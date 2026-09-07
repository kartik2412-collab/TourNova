import type { Metadata } from "next";
import Link from "next/link";
import { MapPin, ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/shared/states";
import { PageHeader } from "@/components/shared/page-header";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ entityId: "preview" }];
}

export default async function DestinationDetailPage({
  params,
}: {
  params: Promise<{ entityId: string }>;
}) {
  const { entityId } = await params;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6">
      <Link
        href="/discover"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to Discover
      </Link>

      <PageHeader
        eyebrow="Destination"
        title={decodeURIComponent(entityId)}
        description="Destination details are available when running locally with a PostgreSQL database."
        icon={<MapPin className="h-5 w-5" aria-hidden="true" />}
      />

      <EmptyState
        title="Destination preview"
        description="Run the project locally with PostgreSQL to see full destination details, coordinates, provenance, and verification status."
        icon={<MapPin className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entityId: string }>;
}): Promise<Metadata> {
  const { entityId } = await params;
  return { title: decodeURIComponent(entityId), description: "Verified destination details." };
}