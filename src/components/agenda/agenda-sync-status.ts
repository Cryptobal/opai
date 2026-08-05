import { Cloud, CloudOff, Loader2, type LucideIcon } from "lucide-react";
import { isGoogleConnectReason } from "@/modules/agenda/agenda-sync-reason";

export type AgendaSyncTone = "ok" | "warn" | "danger" | "neutral";

export type AgendaSyncMeta = {
  status: "SYNCED" | "PENDING" | "ERROR" | "NONE";
  icon: LucideIcon | null;
  label: string;
  tone: AgendaSyncTone;
  /** True cuando la causa es ausencia/desconexión de Google Calendar. */
  needsGoogleConnect: boolean;
  ariaLabel: string;
};

export { isGoogleConnectReason, sanitizeSyncReason } from "@/modules/agenda/agenda-sync-reason";

/**
 * Semántica unificada de sync para chips, filas y detalle.
 * `null`/vacío → no aplica (sin icono).
 */
export function syncStatusMeta(
  status: string | null | undefined,
  reason?: string | null,
): AgendaSyncMeta {
  const safeReason = reason?.trim() || null;

  if (!status || status === "CANCELLED") {
    return {
      status: "NONE",
      icon: null,
      label: "Sin sync",
      tone: "neutral",
      needsGoogleConnect: false,
      ariaLabel: "Sincronización no aplica",
    };
  }

  if (status === "SYNCED") {
    return {
      status: "SYNCED",
      icon: Cloud,
      label: "Sincronizado",
      tone: "ok",
      needsGoogleConnect: false,
      ariaLabel: "Sincronizado con Google Calendar",
    };
  }

  if (status === "ERROR") {
    const needs = isGoogleConnectReason(safeReason);
    const label = safeReason ?? "Error de sincronización";
    return {
      status: "ERROR",
      icon: CloudOff,
      label,
      tone: "danger",
      needsGoogleConnect: needs,
      ariaLabel: `No sincronizado: ${label}`,
    };
  }

  const needs = isGoogleConnectReason(safeReason);
  const label = safeReason
    ? `Pendiente: ${safeReason}`
    : "Pendiente de sincronizar";
  return {
    status: "PENDING",
    icon: Loader2,
    label,
    tone: "warn",
    needsGoogleConnect: needs,
    ariaLabel: label,
  };
}
