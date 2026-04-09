"use client";

import { cn } from "@/lib/utils";
import type { CellStatus } from "@/lib/doc-verificacion-helpers";

type Props = {
  status: CellStatus;
  onClick?: () => void;
  compact?: boolean;
};

const digitalIcons: Record<string, { bg: string; text: string; icon: string }> = {
  ok: { bg: "bg-green-500/15", text: "text-green-500", icon: "📄" },
  alerta: { bg: "bg-amber-500/15", text: "text-amber-500", icon: "📄" },
  falta: { bg: "bg-red-500/15", text: "text-red-500", icon: "✗" },
};

const fisicoIcons: Record<string, { bg: string; text: string; icon: string }> = {
  ok: { bg: "bg-green-500/15", text: "text-green-500", icon: "👁" },
  pendiente: { bg: "bg-amber-500/15", text: "text-amber-500", icon: "—" },
  falta: { bg: "bg-red-500/15", text: "text-red-500", icon: "✗" },
};

export function GrillaCelda({ status, onClick, compact }: Props) {
  const d = digitalIcons[status.digital];
  const f = fisicoIcons[status.fisico];
  const size = compact ? "w-6 h-6 text-xs" : "w-7 h-7 text-sm";

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex justify-center gap-1 p-1 rounded hover:bg-accent/30 transition-colors cursor-pointer"
    >
      <span
        className={cn(size, "inline-flex items-center justify-center rounded-md", d.bg, d.text)}
        title={`Digital: ${status.digital}`}
      >
        {d.icon}
      </span>
      <span
        className={cn(size, "inline-flex items-center justify-center rounded-md", f.bg, f.text)}
        title={`Físico: ${status.fisico}`}
      >
        {f.icon}
      </span>
    </button>
  );
}
