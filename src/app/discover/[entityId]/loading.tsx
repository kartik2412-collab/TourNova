import { SkeletonPage, DetailSkeleton } from "@/components/shared/skeletons";

export default function DestinationLoading() {
  return (
    <SkeletonPage
      label="Loading destination"
      className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6"
    >
      <DetailSkeleton />
    </SkeletonPage>
  );
}
