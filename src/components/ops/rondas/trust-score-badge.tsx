import { cn } from "@/lib/utils";

export function TrustScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80 ? "bg-emerald-500/15 text-emerald-400 border-emerald-400/30"
      : score >= 60 ? "bg-amber-500/15 text-amber-400 border-amber-400/30"
      : "bg-red-500/15 text-red-400 border-red-400/30";

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tone)}>
      Trust {score}
    </span>
  );
}
