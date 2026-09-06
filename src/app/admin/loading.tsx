import { SkeletonPage, AdminSkeleton } from "@/components/shared/skeletons";

export default function AdminLoading() {
  return (
    <SkeletonPage label="Loading admin dashboard">
      <AdminSkeleton />
    </SkeletonPage>
  );
}
