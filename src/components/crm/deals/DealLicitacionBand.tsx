"use client";

import { useRef, type ReactNode } from "react";
import { ChevronRight, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner, Surface, Tag } from "@/components/opai-ds";
import { openAnchoredChat } from "@/lib/ai/ai-command-event";
import { cn } from "@/lib/utils";
import { LICITACION_TIPO_CODIGOS, licitacionSlotState } from "@/modules/crm/documents/licitacion-corpus";
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

function countdownParts(fechaEntrega: string | null): {
  days: number | null;
  header: string | null;
  variant: "danger" | "warn" | "neutral";
} {
  if (!fechaEntrega) return { days: null, header: null, variant: "neutral" };
  const date = new Date(`${fechaEntrega.slice(0, 10)}T12:00:00`);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  const when = date.toLocaleDateString("es-CL", { weekday: "short", day: "numeric" });
  if (days < 0) {
    return {
      days,
      header: `vencida hace ${Math.abs(days)} ${Math.abs(days) === 1 ? "día" : "días"}`,
      variant: "danger",
    };
  }
  if (days === 0) return { days, header: `hoy · ${when}`, variant: "danger" };
  return {
    days,
    header: `${days} ${days === 1 ? "día" : "días"} · ${when}`,
    variant: days <= 3 ? "danger" : days <= 7 ? "warn" : "neutral",
  };
}

function DatePickerButton({
  value,
  onChange,
  children,
  className,
}: {
  value: string | null;
  onChange?: (ymd: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          const el = ref.current;
          if (!el) return;
          if (typeof el.showPicker === "function") el.showPicker();
          else el.click();
        }}
        className={className}
      >
        {children}
      </button>
      <input
        ref={ref}
        type="date"
        value={value?.slice(0, 10) ?? ""}
        onChange={(e) => {
          if (e.target.value) onChange?.(e.target.value);
        }}
        className="sr-only"
        aria-label="Fecha de entrega de la licitación"
      />
    </>
  );
}

const DOT: Record<"ok" | "warn" | "neutral", string> = {
  ok: "bg-status-ok",
  warn: "bg-status-warn",
  neutral: "bg-ds-text-4",
};

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
  onFechaChange,
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
  onFechaChange?: (ymd: string) => void;
}) {
  const cd = countdownParts(fechaEntrega);
  const basesReady = types.some((t) => t.codigo === LICITACION_TIPO_CODIGOS.bases && t.extracted);

  return (
    <Surface elevation={1} padding="sm" className="space-y-2 lg:space-y-3 lg:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-semibold text-ds-text-1">
          Documentos de licitación
        </p>
        {cd.header ? (
          <DatePickerButton
            value={fechaEntrega}
            onChange={onFechaChange}
            className="shrink-0"
          >
            <Tag variant={cd.variant} size="sm">
              {cd.header}
            </Tag>
          </DatePickerButton>
        ) : null}
      </div>

      {!fechaEntrega ? (
        <DatePickerButton
          value={fechaEntrega}
          onChange={onFechaChange}
          className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-0 text-left text-[13px] text-ds-text-2 lg:min-h-9"
        >
          <span>Definir fecha de cierre</span>
          <ChevronRight className="h-4 w-4 text-ds-text-3" />
        </DatePickerButton>
      ) : null}

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
