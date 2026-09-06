import {
  Skeleton,
  SkeletonPage,
  SkeletonHeader,
  SkeletonForm,
  SkeletonGrid,
} from "@/components/shared/skeletons";

export default function CrowdLoading() {
  return (
    <SkeletonPage
      label="Loading crowd information"
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6"
    >
      <SkeletonHeader />
      <Skeleton className="h-14 w-full rounded-xl" />
      <SkeletonForm />
      <Skeleton className="h-5 w-56" />
      <SkeletonGrid count={4} columns="grid-cols-1 gap-4 sm:grid-cols-2" />
    </SkeletonPage>
  );
}
