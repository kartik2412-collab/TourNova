import { SkeletonPage, AdminSkeleton } from "@/components/shared/skeletons";

export default function AdminIngestionLoading() {
  return (
    <SkeletonPage label="Loading ingestion review">
      <AdminSkeleton />
    </SkeletonPage>
  );
}
