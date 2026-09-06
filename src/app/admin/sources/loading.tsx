import { SkeletonPage, AdminSkeleton } from "@/components/shared/skeletons";

export default function AdminSourcesLoading() {
  return (
    <SkeletonPage label="Loading source registry">
      <AdminSkeleton />
    </SkeletonPage>
  );
}
