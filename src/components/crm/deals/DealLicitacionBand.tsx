"use client";

import { ChevronRight, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner, Surface, Tag } from "@/components/opai-ds";
import { formatDealDateCountdown, formatDealDateShort } from "@/components/crm/deals/deals-helpers";
import { openAnchoredChat } from "@/lib/ai/ai-command-event";
import { cn } from "@/lib/utils";
import { LICITACION_TIPO_CODIGOS, licitacionSlotState } from "@/modules/crm/documents/licitacion-corpus";
import { JourneyStepper, PulseBar, TENDER_JOURNEY } from "@/components/workbench";
import type { LicitacionTypeRow } from "./useDealLicitacionDocs";

const SLOTS: Array<{ codigo: string; label: string; optional?: boolean }> = [
  { codigo: LICITACION_TIPO_CODIGOS.bases, label: "Bases técnicas" },
  { codigo: LICITACION_TIPO_CODIGOS.bases_admin, label: "Bases administrativas" },
  { codigo: LICITACION_TIPO_CODIGOS.qa, label: "Q&A / Aclaraciones" },
  { codigo: LICITACION_TIPO_CODIGOS.anexos, label: "Anexos", optional: true },
];

function slotState(types: LicitacionTypeRow[], codigo: string, filesUnclassified: boolean, optional?: boolean) {
  const row = types.find((t) => t.codigo === codigo);
  return licitacionSlotState({
    present: Boolean(row?.present),
    extracted: Boolean(row?.extracted),
    hasUnclassified: filesUnclassified,
    optional,
  });
}

const DOT: Record<"ok" | "warn" | "neutral", string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  neutral: "bg-ds-text-4",
};

/** Ventana de referencia (días) para el anillo de urgencia del countdown. */
const URGENCY_WINDOW_DAYS = 14;

export function DealLicitacionBand({
  dealId,
  dealTitle,
  fechaEntrega,
  loading,
  error,
  types,
  hasUnclassified,
  gate,
  onOpenDocumentos,
  journeyIndex = 0,
}: {
  dealId: string;
  dealTitle: string;
  fechaEntrega: string | null;
  loading: boolean;
  error: string | null;
  types: LicitacionTypeRow[];
  hasUnclassified: boolean;
  gate: string | null;
  onOpenDocumentos: (tipoCodigo: string) => void;
  /** Índice 0-based en TENDER_JOURNEY, calculado por el padre a partir de datos existentes. */
  journeyIndex?: number;
}) {
  const cd = formatDealDateCountdown(fechaEntrega);
  const short = formatDealDateShort(fechaEntrega);
  const basesReady = types.some((t) => t.codigo === LICITACION_TIPO_CODIGOS.bases && t.extracted);

  // Sin fecha de entrega: pulso neutro, sin countdown ni anillo (edge case del brief).
  const pulseProgress = cd ? Math.max(0, Math.min(1, 1 - cd.days / URGENCY_WINDOW_DAYS)) : null;

  return (
    <Surface elevation={1} padding="sm" className="space-y-3 lg:space-y-3.5 lg:p-4">
      <div className="flex items-center gap-4">
        <PulseBar
          variant="tender"
          neutral={!cd}
          value={cd ? cd.text : "Sin fecha"}
          subtitle={short ? `Entrega ${short}` : "Definir fecha de entrega"}
          progress={pulseProgress}
          className="min-w-[180px] shrink-0 !min-h-0 !px-0 !py-0"
        />
        <div className="min-w-0 flex-1">
          <JourneyStepper steps={TENDER_JOURNEY} activeIndex={journeyIndex} />
        </div>
      </div>

      <p className="text-[13px] font-semibold text-ds-text-1">Documentos de licitación</p>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
          <Spinner size="sm" /> Cargando slots…
        </div>
      ) : error ? (
        <p className="text-[13px] text-status-danger-fg">{error}</p>
      ) : (
        <>
          <ul className="divide-y divide-ds-border-subtle lg:hidden">
            {SLOTS.map((slot) => {
              const st = slotState(
                types,
                slot.codigo,
                hasUnclassified,
                slot.optional,
              );
              return (
                <li key={slot.codigo}>
                  <button
                    type="button"
                    onClick={() => onOpenDocumentos(slot.codigo)}
                    className="flex min-h-10 w-full items-center gap-2 py-2 text-left"
                  >
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[st.tone])} />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ds-text-1">
                      {slot.label}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[12px]",
                        st.tone === "ok"
                          ? "text-status-ok-fg"
                          : st.tone === "warn"
                            ? "text-status-warn-fg"
                            : "text-ds-text-3",
                      )}
                    >
                      {st.short}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ds-text-4" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden grid-cols-1 gap-2 sm:grid-cols-2 lg:grid xl:grid-cols-4">
            {SLOTS.map((slot) => {
              const st = slotState(
                types,
                slot.codigo,
                hasUnclassified,
                slot.optional,
              );
              return (
                <button
                  key={slot.codigo}
                  type="button"
                  onClick={() => onOpenDocumentos(slot.codigo)}
                  className="flex min-h-[44px] flex-col items-start gap-1 rounded-xl border border-ds-border-subtle bg-ds-surface-2 px-3 py-2.5 text-left hover:border-ds-border-default"
                >
                  <span className="text-[13px] font-medium text-ds-text-1">
                    {slot.label}
                    {slot.optional ? <span className="text-ds-text-3"> · opcional</span> : null}
                  </span>
                  <Tag variant={st.tone} size="sm">
                    {st.label}
                  </Tag>
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <Button
          type="button"
          className="h-10 w-full lg:h-9 lg:w-auto"
          onClick={() =>
            openAnchoredChat({ anchorType: "crm_deal", anchorId: dealId, entityName: dealTitle })
          }
        >
          {basesReady ? <Sparkles className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          {basesReady ? "Generar propuesta en el chat" : "Chat de licitación"}
        </Button>
        <p className="text-[12px] text-ds-text-3 lg:text-right">
          {gate
            ? "Faltan las bases técnicas para el índice. Las administrativas no bloquean."
            : "Bases técnicas listas. Puedes pedir el índice en el chat."}
        </p>
      </div>
    </Surface>
  );
}
