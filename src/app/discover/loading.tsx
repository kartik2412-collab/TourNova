import {
  Skeleton,
  SkeletonPage,
  SkeletonHeader,
  SkeletonGrid,
} from "@/components/shared/skeletons";

export default function DiscoverLoading() {
  return (
    <SkeletonPage
      label="Loading destinations"
      className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6"
    >
      <SkeletonHeader />
      <Skeleton className="h-12 w-full rounded-2xl" />
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-card">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-5 w-64" />
      <SkeletonGrid count={6} />
    </SkeletonPage>
  );
}
