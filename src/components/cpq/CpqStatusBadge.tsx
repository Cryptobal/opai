/**
 * Badge de estado de cotización. draft⇄sent es interactivo (toggle);
 * approved/rejected/otros son solo lectura.
 */
"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  status: string;
  changing: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
  /** Negocio licitación: el draft→sent va por acción dedicada, no por PATCH. */
  isLicitacion?: boolean;
}

const LABELS: Record<string, string> = {
  draft: "Borrador",
  sent: "Enviada",
  approved: "Aprobada",
  rejected: "Rechazada",
};

function statusTone(status: string): { dot: string; label: string } {
  if (status === "sent") return { dot: "bg-status-info", label: "text-status-info-fg" };
  if (status === "draft") return { dot: "bg-status-warn", label: "text-status-warn-fg" };
  if (status === "approved") return { dot: "bg-status-ok", label: "text-status-ok-fg" };
  if (status === "rejected") return { dot: "bg-status-danger", label: "text-status-danger-fg" };
  return { dot: "bg-muted-foreground", label: "text-muted-foreground" };
}

export function CpqStatusBadge({
  status,
  changing,
  onToggle,
  size = "md",
  isLicitacion = false,
}: Props) {
  const tone = statusTone(status);
  const label = LABELS[status] ?? status;
  const interactive = status === "draft" || status === "sent";
  const title =
    status === "draft"
      ? isLicitacion
        ? "Usá «Marcar enviada (licitación)» en el centro de control"
        : "Para marcar como enviada usá Enviar propuesta"
      : status === "sent"
        ? "Clic para marcar como borrador (editar)"
        : undefined;

  const shell = cn(
    "inline-flex items-center rounded-md border border-border/60 bg-background/40",
    size === "sm" ? "h-6 gap-1.5 px-2 text-[11px]" : "h-8 gap-2 px-2.5 py-1 text-xs",
    interactive && !changing && "hover:border-muted-foreground/40 cursor-pointer",
    changing && "opacity-70",
  );

  const inner = (
    <>
      {changing ? (
        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-hidden />
      ) : (
        <span className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)} aria-hidden />
      )}
      <span className={cn("font-medium", tone.label)}>{label}</span>
    </>
  );

  if (!interactive) {
    return <span className={shell}>{inner}</span>;
  }

  return (
    <button
      type="button"
      className={shell}
      title={title}
      aria-label={title}
      disabled={changing}
      onClick={onToggle}
    >
      {inner}
    </button>
  );
}
