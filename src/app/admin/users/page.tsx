import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/states";

export const metadata: Metadata = {
  title: "User Directory",
};

export default function UsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Admin"
        title="User Directory"
        description="Manage roles, permissions, and account activity."
        icon={<Users className="h-5 w-5" aria-hidden="true" />}
      />
      <EmptyState
        title="Preview mode"
        description="Run locally with PostgreSQL to access the user directory."
        icon={<Users className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}
