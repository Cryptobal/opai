"use client";

/**
 * Franja de veredicto del clasificador radar. Solo se renderiza cuando el
 * hilo tiene `aiClassifiedAt`. Variante `full` (Copiloto) incluye el párrafo
 * de aiSummary; `compact` (lector) es una sola línea de chips + chevron.
 */

import { ChevronRight, Clock3 } from "lucide-react";
import { Tag } from "@/components/opai-ds";

const CATEGORY_LABEL: Record<string, string> = {
  cotizacion: "Cotización",
  licitacion: "Licitación",
  consulta_comercial: "Consulta comercial",
  facturacion: "Facturación",
  operacional: "Operacional",
  otro: "Otro",
};

const URGENCY_VARIANT: Record<string, "danger" | "warn" | "neutral"> = {
  alta: "danger",
  media: "warn",
  baja: "neutral",
};

export type CorreoVerdictData = {
  aiCategory: string | null;
  aiSummary: string | null;
  aiUrgency: string | null;
  aiClassifiedAt: string | null;
  lastMessageAt?: string | null;
  dealFechaEntrega?: string | null;
};

function daysUntil(isoDate: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

function verdictBits(data: CorreoVerdictData) {
  const categoryLabel =
    (data.aiCategory && CATEGORY_LABEL[data.aiCategory]) || data.aiCategory || "Clasificado";
  const urgency = data.aiUrgency && URGENCY_VARIANT[data.aiUrgency] ? data.aiUrgency : null;
  const stale =
    data.lastMessageAt &&
    new Date(data.lastMessageAt).getTime() > new Date(data.aiClassifiedAt!).getTime();
  const deadlineDays =
    data.dealFechaEntrega != null ? daysUntil(data.dealFechaEntrega) : null;
  const deadlineLabel =
    deadlineDays == null
      ? null
      : deadlineDays < 0
        ? `Plazo hace ${Math.abs(deadlineDays)}d`
        : deadlineDays === 0
          ? "Plazo hoy"
          : `Plazo en ${deadlineDays}d`;
  return { categoryLabel, urgency, stale, deadlineLabel };
}

export function CorreoVerdictStrip({
  data,
  variant = "full",
}: {
  data: CorreoVerdictData;
  variant?: "full" | "compact";
}) {
  if (!data.aiClassifiedAt) return null;

  const { categoryLabel, urgency, stale, deadlineLabel } = verdictBits(data);

  if (variant === "compact") {
    const titleParts = [categoryLabel];
    if (urgency) titleParts.push(`Urgencia ${urgency}`);
    if (deadlineLabel) titleParts.push(deadlineLabel);
    return (
      <div
        className="flex min-w-0 items-center gap-1.5 overflow-hidden rounded-xl border border-tint-violet/25 bg-tint-violet/5 px-2.5 py-1.5"
        title={titleParts.join(" · ")}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <Tag variant="info" size="sm">
            {categoryLabel}
          </Tag>
          {urgency && (
            <Tag variant={URGENCY_VARIANT[urgency]} size="sm">
              Urgencia {urgency}
            </Tag>
          )}
          {deadlineLabel && (
            <span className="shrink-0 truncate text-[12px] text-ds-text-3">{deadlineLabel}</span>
          )}
          {stale && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-ds-text-4">
              <Clock3 className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-4" aria-hidden />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-start gap-2 rounded-xl border border-tint-violet/25 bg-tint-violet/5 px-2.5 py-2">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag variant="info" size="sm">
            {categoryLabel}
          </Tag>
          {urgency && (
            <Tag variant={URGENCY_VARIANT[urgency]} size="sm">
              Urgencia {urgency}
            </Tag>
          )}
          {stale && (
            <span className="inline-flex items-center gap-1 text-[12px] text-ds-text-4">
              <Clock3 className="h-3.5 w-3.5" /> Desactualizado
            </span>
          )}
          {deadlineLabel && (
            <span className="text-[12px] text-ds-text-3">{deadlineLabel}</span>
          )}
        </div>
        {data.aiSummary && (
          <p className="line-clamp-2 text-[13px] leading-5 text-ds-text-2">{data.aiSummary}</p>
        )}
      </div>
    </div>
  );
}
