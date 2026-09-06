import {
  Skeleton,
  SkeletonPage,
  SkeletonHeader,
  SkeletonForm,
  SkeletonGrid,
} from "@/components/shared/skeletons";

export default function FairPriceLoading() {
  return (
    <SkeletonPage
      label="Loading price information"
      className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-10 sm:px-6"
    >
      <SkeletonHeader />
      <Skeleton className="h-14 w-full rounded-xl" />
      <SkeletonForm />
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-5 w-40" />
      </div>
      <SkeletonGrid count={4} columns="grid-cols-1 gap-4 sm:grid-cols-2" />
    </SkeletonPage>
  );
}
