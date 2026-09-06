import {
  Skeleton,
  SkeletonPage,
  SkeletonHeader,
  SkeletonForm,
  SkeletonRows,
} from "@/components/shared/skeletons";

export default function NearbyLoading() {
  return (
    <SkeletonPage
      label="Loading nearby destinations"
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6"
    >
      <SkeletonHeader />
      <Skeleton className="h-14 w-full rounded-xl" />
      <SkeletonForm />
      <SkeletonRows count={5} />
    </SkeletonPage>
  );
}
