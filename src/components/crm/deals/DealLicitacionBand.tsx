"use client";

import { MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner, Surface, Tag } from "@/components/opai-ds";
import { openAnchoredChat } from "@/lib/ai/ai-command-event";
import { LICITACION_TIPO_CODIGOS } from "@/modules/crm/documents/licitacion-corpus";
import type { LicitacionTypeRow } from "./useDealLicitacionDocs";

const SLOTS: Array<{ codigo: string; label: string; optional?: boolean }> = [
  { codigo: LICITACION_TIPO_CODIGOS.bases, label: "Bases técnicas" },
  { codigo: LICITACION_TIPO_CODIGOS.bases_admin, label: "Bases administrativas" },
  { codigo: LICITACION_TIPO_CODIGOS.qa, label: "Q&A / Aclaraciones" },
  { codigo: LICITACION_TIPO_CODIGOS.anexos, label: "Anexos", optional: true },
];

function slotState(types: LicitacionTypeRow[], codigo: string, filesUnclassified: boolean) {
  const row = types.find((t) => t.codigo === codigo);
  if (row?.extracted) return { label: "Clasificado · texto listo", tone: "ok" as const };
  if (row?.present) return { label: "Sin texto extraído", tone: "warn" as const };
  if (filesUnclassified) return { label: "Sin clasificar", tone: "warn" as const };
  return { label: "Falta", tone: "neutral" as const };
}

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
  const days = fechaEntrega
    ? Math.ceil(
        (new Date(`${fechaEntrega.slice(0, 10)}T12:00:00`).getTime() - Date.now()) / 86_400_000,
      )
    : null;
  const countdown =
    days == null
      ? null
      : days < 0
        ? "vencida"
        : days === 0
          ? "entrega hoy"
          : `entrega en ${days}d`;
  const basesReady = types.some((t) => t.codigo === LICITACION_TIPO_CODIGOS.bases && t.extracted);

  return (
    <Surface elevation={1} padding="md" className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ds-text-1">Licitación</p>
          <p className="text-[12px] text-ds-text-3">
            Vista de la carpeta Documentos (sync Drive). Los slots no almacenan archivos.
          </p>
        </div>
        {countdown ? (
          <Tag variant={days != null && days <= 3 ? "danger" : days != null && days <= 7 ? "warn" : "neutral"} size="sm">
            {countdown}
          </Tag>
        ) : (
          <label className="flex flex-col items-start gap-1 sm:items-end">
            <span className="text-[12px] font-medium text-ds-text-3">Definir fecha de cierre</span>
            <input
              type="date"
              onChange={(e) => {
                if (e.target.value) onFechaChange?.(e.target.value);
              }}
              className="h-10 rounded-md border border-ds-border-default bg-ds-surface-2 px-2 text-[13px] text-ds-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
              aria-label="Fecha de entrega de la licitación"
            />
          </label>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[13px] text-ds-text-3">
          <Spinner size="sm" /> Cargando slots…
        </div>
      ) : error ? (
        <p className="text-[13px] text-status-danger-fg">{error}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {SLOTS.map((slot) => {
            const st = slotState(types, slot.codigo, hasUnclassified && slot.codigo === LICITACION_TIPO_CODIGOS.bases);
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
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          className="h-10 sm:h-9"
          onClick={() =>
            openAnchoredChat({ anchorType: "crm_deal", anchorId: dealId, entityName: dealTitle })
          }
        >
          {basesReady ? <Sparkles className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
          {basesReady ? "Generar propuesta en el chat" : "Chat de licitación"}
        </Button>
        <p className="text-[12px] text-ds-text-3">
          {gate
            ? "Faltan las bases técnicas para el índice. Las administrativas no bloquean."
            : "Bases técnicas listas. Puedes pedir el índice en el chat."}
        </p>
      </div>
    </Surface>
  );
}
