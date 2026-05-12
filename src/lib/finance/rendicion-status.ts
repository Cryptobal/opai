// Mapeo centralizado de estados de rendiciones (label, className, icono).
// Reemplaza copias divergentes que vivían en cada componente. Usa tokens
// semánticos DS v3 — no cambiar a hex / colores duros.

import type { LucideIcon } from "lucide-react";
import {
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  Wallet,
  FileEdit,
} from "lucide-react";

export type RendicionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "PAID";

export interface StatusConfig {
  label: string;
  className: string;
  icon: LucideIcon;
}

export const RENDICION_STATUS_CONFIG: Record<RendicionStatus, StatusConfig> = {
  DRAFT: {
    label: "Borrador",
    className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    icon: FileEdit,
  },
  SUBMITTED: {
    label: "Enviada",
    className:
      "bg-status-info-soft text-status-info-fg border-status-info-border",
    icon: Send,
  },
  IN_APPROVAL: {
    label: "En aprobación",
    className:
      "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
    icon: Clock,
  },
  APPROVED: {
    label: "Aprobada",
    className: "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
    icon: CheckCircle2,
  },
  REJECTED: {
    label: "Rechazada",
    className:
      "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
    icon: XCircle,
  },
  PAID: {
    label: "Pagada",
    className: "bg-tint-violet text-tint-violet-fg border-tint-violet-fg/30",
    icon: Wallet,
  },
};

export function getRendicionStatusConfig(status: string): StatusConfig {
  return (
    RENDICION_STATUS_CONFIG[status as RendicionStatus] ?? {
      label: status,
      className: "bg-muted text-muted-foreground border-border",
      icon: FileEdit,
    }
  );
}

export function getRendicionStatusLabel(status: string): string {
  return getRendicionStatusConfig(status).label;
}
