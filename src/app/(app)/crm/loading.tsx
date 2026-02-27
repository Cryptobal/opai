import { Skeleton } from "@/components/ui/skeleton";

export default function CrmLoading() {
  return (
    <div className="space-y-6 min-w-0">
      {/* Header skeleton */}
      <div className="space-y-1.5">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-3 w-56" />
      </div>
      {/* KPI grid */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
      </div>
      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-4 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[300px] w-full rounded" />
        </div>
        <div className="rounded-lg border border-border p-4 space-y-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-[300px] w-full rounded" />
        </div>
      </div>
    </div>
  );
}
