"use client";

import { cn } from "@/lib/utils";
import type { CellStatus } from "@/lib/doc-verificacion-helpers";

type Props = {
  status: CellStatus;
  onClick?: () => void;
  compact?: boolean;
  hallazgosAbiertos?: number;
  hallazgosSeverity?: string | null;
  hallazgoTicketCode?: string | null;
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

function severityBadgeColor(severity: string | null): string {
  if (severity === "critical") return "bg-red-500 text-white";
  if (severity === "major") return "bg-amber-500 text-white";
  return "bg-blue-500 text-white";
}

export function GrillaCelda({
  status,
  onClick,
  compact,
  hallazgosAbiertos = 0,
  hallazgosSeverity = null,
  hallazgoTicketCode = null,
}: Props) {
  const d = digitalIcons[status.digital];
  const f = fisicoIcons[status.fisico];
  const size = compact ? "w-6 h-6 text-xs" : "w-7 h-7 text-sm";
  const hasHallazgo = hallazgosAbiertos > 0;

  const title = hasHallazgo
    ? `${hallazgosAbiertos} hallazgo(s) abierto(s)${hallazgoTicketCode ? ` — Ticket #${hallazgoTicketCode}` : ""}`
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="relative flex justify-center gap-1 p-1 rounded hover:bg-accent/30 transition-colors cursor-pointer"
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

      {hasHallazgo && (
        <span
          className={cn(
            "absolute -top-1 -right-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold leading-none shadow-sm",
            "min-w-[14px] h-[14px] px-[3px]",
            severityBadgeColor(hallazgosSeverity),
          )}
        >
          {hallazgosAbiertos > 9 ? "9+" : hallazgosAbiertos}
        </span>
      )}
    </button>
  );
}
