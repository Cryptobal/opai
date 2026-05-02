import { cn } from "@/lib/utils";

export interface SkeletonProps {
  /** Forma. */
  shape?: "rect" | "circle" | "text";
  /** Tailwind width override (ej. "w-32"). */
  className?: string;
}

export function Skeleton({ shape = "rect", className }: SkeletonProps) {
  return (
    <span
      className={cn(
        "ds-shimmer block",
        shape === "circle" ? "rounded-full" :
        shape === "text"   ? "rounded h-3" :
                             "rounded-ds-md h-4",
        className,
      )}
    />
  );
}
