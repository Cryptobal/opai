import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

/* ── Preset skeletons ── */

/** 3 note-like rows with avatar + text lines */
function NotesSkeleton() {
  return (
    <div className="space-y-4 py-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="h-7 w-7 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-12" />
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** 3 file-like rows with icon + filename */
function FileListSkeleton() {
  return (
    <div className="space-y-2 py-2">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 py-1.5">
          <Skeleton className="h-8 w-8 rounded shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-20" />
          </div>
          <Skeleton className="h-6 w-6 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** Form-like skeleton with label + input pairs */
function FormSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4 py-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Email content placeholder */
function EmailContentSkeleton() {
  return (
    <div className="rounded-md border p-3 space-y-2">
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-4/6" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

export {
  Skeleton,
  NotesSkeleton,
  FileListSkeleton,
  FormSkeleton,
  EmailContentSkeleton,
};
