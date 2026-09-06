import { SkeletonPage, AdminSkeleton } from "@/components/shared/skeletons";

export default function AdminCrowdLoading() {
  return (
    <SkeletonPage label="Loading crowd review">
      <AdminSkeleton />
    </SkeletonPage>
  );
}
