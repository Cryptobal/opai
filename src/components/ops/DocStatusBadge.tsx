"use client";

import { cn } from "@/lib/utils";

type DocStatus = "vigente" | "por_vencer" | "vencido" | "no_aplica" | "sin_documento";

const STYLES: Record<DocStatus, string> = {
  vigente: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
  por_vencer: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  vencido: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
  no_aplica: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  sin_documento: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
};

const LABELS: Record<DocStatus, string> = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  no_aplica: "Sin vencimiento",
  sin_documento: "Sin documento",
};

interface Props {
  status: string;
  expiresAt?: string | null;
  className?: string;
}

export function DocStatusBadge({ status, expiresAt, className }: Props) {
  const s = (STYLES[status as DocStatus] ? status : "sin_documento") as DocStatus;
  const label = LABELS[s];

  // Show days remaining for "por_vencer"
  let extra = "";
  if (s === "por_vencer" && expiresAt) {
    const now = new Date();
    const exp = new Date(expiresAt);
    const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (diff > 0) extra = ` (${diff}d)`;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        STYLES[s],
        className
      )}
    >
      {label}{extra}
    </span>
  );
}
