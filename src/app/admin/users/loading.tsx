import { SkeletonPage, AdminSkeleton } from "@/components/shared/skeletons";

export default function AdminUsersLoading() {
  return (
    <SkeletonPage label="Loading user management">
      <AdminSkeleton />
    </SkeletonPage>
  );
}
