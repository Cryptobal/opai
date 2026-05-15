"use client";

/**
 * DteAgingBadge — badge de antigüedad / estado de cobranza de un DTE.
 *
 * Reglas:
 *   - Anulada           → "Anulada" (gris)
 *   - Pagada (PAID)     → "Pagada" (verde, con check)
 *   - Parcial (PARTIAL) → "Parcial Nd" (amarillo)
 *   - Vencida (dueDate < hoy y no pagada) → "Vencida Nd" (rojo)
 *   - UNPAID + edad < 30 → "Nd" (gris)
 *   - UNPAID + 30-60      → "Nd" (amarillo)
 *   - UNPAID + 60-90      → "Nd" (naranja)
 *   - UNPAID + > 90       → "Nd" (rojo)
 *
 * Tono semántico OPAI DS v3 (status-{ok,warn,danger}-{soft,fg,border}).
 */

import { Badge } from "@/components/ui/badge";
import { Check, AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatDateOnlyUtcYmd,
  parseYmdToDbDate,
  todayChileStr,
} from "@/lib/fx-date";

function calendarDaysDiff(laterYmd: string, earlierYmd: string): number {
  const ms =
    parseYmdToDbDate(laterYmd).getTime() - parseYmdToDbDate(earlierYmd).getTime();
  return Math.round(ms / 86_400_000);
}

export interface DteAgingInput {
  /** Fecha tributaria del DTE (ISO string). */
  date: string;
  /** Vencimiento opcional. */
  dueDate?: string | null;
  /** Estado de pago (UNPAID / PARTIAL / PAID / OVERDUE / WRITTEN_OFF). */
  paymentStatus?: string | null;
  /** Estado SII — sólo se evalúa para identificar ANNULLED. */
  siiStatus: string;
}

interface BadgeShape {
  label: string;
  className: string;
  icon?: "ok" | "danger" | "clock";
}

function getAgingBadge(input: DteAgingInput): BadgeShape {
  if (input.siiStatus === "ANNULLED") {
    return {
      label: "Anulada",
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
    };
  }
  if (input.paymentStatus === "PAID") {
    return {
      label: "Pagada",
      className:
        "bg-status-ok-soft text-status-ok-fg border-status-ok-border",
      icon: "ok",
    };
  }

  const todayYmd = todayChileStr();
  const issueYmd = formatDateOnlyUtcYmd(new Date(input.date));
  const daysSinceIssue = calendarDaysDiff(todayYmd, issueYmd);

  // Vencida: dueDate ya pasó.
  if (input.dueDate) {
    const dueYmd = formatDateOnlyUtcYmd(new Date(input.dueDate));
    const daysUntilDue = calendarDaysDiff(dueYmd, todayYmd);
    if (daysUntilDue < 0) {
      return {
        label: `Vencida ${Math.abs(daysUntilDue)}d`,
        className:
          "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
        icon: "danger",
      };
    }
  }

  if (input.paymentStatus === "PARTIAL") {
    return {
      label: `Parcial ${daysSinceIssue}d`,
      className:
        "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
      icon: "clock",
    };
  }

  if (daysSinceIssue < 30) {
    return {
      label: `${daysSinceIssue}d`,
      className: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
      icon: "clock",
    };
  }
  if (daysSinceIssue < 60) {
    return {
      label: `${daysSinceIssue}d`,
      className:
        "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
      icon: "clock",
    };
  }
  if (daysSinceIssue < 90) {
    return {
      label: `${daysSinceIssue}d`,
      className:
        "bg-status-warn-soft text-status-warn-fg border-status-warn-border",
      icon: "danger",
    };
  }
  return {
    label: `${daysSinceIssue}d`,
    className:
      "bg-status-danger-soft text-status-danger-fg border-status-danger-border",
    icon: "danger",
  };
}

export function DteAgingBadge(props: DteAgingInput) {
  const badge = getAgingBadge(props);
  const Icon =
    badge.icon === "ok"
      ? Check
      : badge.icon === "danger"
      ? AlertTriangle
      : badge.icon === "clock"
      ? Clock
      : null;
  return (
    <Badge variant="outline" className={cn("text-[12px] gap-1", badge.className)}>
      {Icon && <Icon className="h-3 w-3" />}
      {badge.label}
    </Badge>
  );
}
