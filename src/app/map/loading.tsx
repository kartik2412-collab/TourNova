import { Skeleton, SkeletonPage, SkeletonHeader, SkeletonMap } from "@/components/shared/skeletons";

export default function MapLoading() {
  return (
    <SkeletonPage
      label="Loading map"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6"
    >
      <SkeletonHeader />
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-56 rounded-full" />
        <Skeleton className="h-8 w-64 rounded-full" />
      </div>
      <Skeleton className="h-14 w-full rounded-xl" />
      <SkeletonMap />
    </SkeletonPage>
  );
}
