import { cn } from "@/lib/utils";

export function TrustScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null || score === 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-zinc-700/30 bg-zinc-800/30 px-2 py-0.5 text-xs font-medium text-zinc-500">
        Trust —
      </span>
    );
  }

  const tone =
    score >= 80 ? "bg-status-ok-soft text-status-ok-fg border-status-ok-border"
      : score >= 60 ? "bg-status-warn-soft text-status-warn-fg border-status-warn-border"
      : "bg-status-danger-soft text-status-danger-fg border-status-danger-border";

  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", tone)}>
      Trust {score}
    </span>
  );
}
