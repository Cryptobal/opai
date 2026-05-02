"use client";

import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  isModified: boolean;
  consolidatedAt: Date | string | null;
  opposedAt: Date | string | null;
  className?: string;
}

type Estado = "pendiente" | "opuesta" | "consolidada";

function getEstado(consolidatedAt: Props["consolidatedAt"], opposedAt: Props["opposedAt"]): Estado {
  if (consolidatedAt) return "consolidada";
  if (opposedAt) return "opuesta";
  return "pendiente";
}

const CONFIG: Record<Estado, { label: string; title: string; icon: React.ElementType; className: string }> = {
  pendiente: {
    label: "Modificada",
    title: "Modificación pendiente de oposición (48h)",
    icon: AlertCircle,
    className: "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
  },
  opuesta: {
    label: "Opuesta",
    title: "Modificación opuesta por el trabajador",
    icon: XCircle,
    className: "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
  },
  consolidada: {
    label: "Consolidada",
    title: "Modificación consolidada (plazo vencido)",
    icon: CheckCircle2,
    className: "bg-slate-100 text-slate-600 border-slate-200",
  },
};

export function MarcacionModificadaBadge({ isModified, consolidatedAt, opposedAt, className }: Props) {
  if (!isModified) return null;

  const estado = getEstado(consolidatedAt, opposedAt);
  const { label, title, icon: Icon, className: stateClass } = CONFIG[estado];

  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium",
        stateClass,
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {label}
    </span>
  );
}
