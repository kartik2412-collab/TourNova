import { SkeletonPage, AdminSkeleton } from "@/components/shared/skeletons";

export default function AdminPricesLoading() {
  return (
    <SkeletonPage label="Loading price review">
      <AdminSkeleton />
    </SkeletonPage>
  );
}
