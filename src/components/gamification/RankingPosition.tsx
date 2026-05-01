"use client";

import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── Props ─── */

interface RankingPositionProps {
  posicion: number;
  total: number;
  className?: string;
}

/* ─── Component ─── */

export function RankingPosition({
  posicion,
  total,
  className,
}: RankingPositionProps) {
  const percentil = total > 0 ? Math.round((posicion / total) * 100) : 0;

  return (
    <div className={cn("inline-flex items-center gap-1.5", className)}>
      <Trophy size={16} className="text-status-warn-fg" />
      <span className="font-medium text-foreground">Top {percentil}%</span>
      <span className="text-muted-foreground">
        &mdash; #{posicion} de {total}
      </span>
    </div>
  );
}
