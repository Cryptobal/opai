"use client";

import { ChevronDown } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import type { HoverCardModel } from "./cell-hover-content";
import { CellNoteEditor } from "./CellNoteEditor";

interface Props {
  model: HoverCardModel;
  focusNote: boolean;
  canManage: boolean;
  rowId: string;
  weekStart: string;
  noteInitial: string;
  onSaveNote: (rowId: string, weekStart: string, body: string | null) => Promise<boolean>;
  onOpenActions: (el: HTMLElement) => void;
  onViewDte?: (dteId: string) => void;
  onSendCobranza?: (args: {
    dteId: string;
    crmAccountId: string | null;
    daysOverdue: number;
  }) => void;
  onEditTerm?: () => void;
}

/** Cuerpo presentacional de la ficha de detalle (clic en desktop). */
export function CellHoverCardBody(p: Props) {
  const { model } = p;
  return (
    <>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-ds-text-1">{model.concept}</span>
        <span className="shrink-0 text-[12px] tabular-nums text-ds-text-3">
          {model.subtitle}
        </span>
      </div>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {model.badges.map((b) => (
          <Tag key={b} size="sm" variant={b === "manual" ? "brand" : "neutral"}>{b}</Tag>
        ))}
      </div>
      {model.colorMeaning && (
        <div
          className="mb-1.5 flex items-start gap-2 rounded-md border border-ds-border-subtle bg-ds-surface-2 px-1.5 py-1"
          role="note"
          aria-label={`Colores: ${model.colorMeaning.title}`}
        >
          <span
            className={`mt-0.5 h-4 w-6 shrink-0 rounded-sm ${model.colorMeaning.swatch}`}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-ds-text-1">
              {model.colorMeaning.title}
            </p>
            <p className="text-[12px] leading-snug text-ds-text-3">
              {model.colorMeaning.desc}
            </p>
          </div>
        </div>
      )}
      {model.lines.length > 0 && (
        <div className="mb-1.5 space-y-0.5 border-t border-ds-border-subtle pt-1.5">
          {model.lines.map((l) => (
            <div
              key={l.label}
              className={`flex justify-between gap-2 ${l.emphasize ? "font-medium text-ds-text-1" : l.muted ? "text-ds-text-4" : "text-ds-text-2"}`}
            >
              <span>{l.label}</span>
              <span className="tabular-nums">{l.value}</span>
            </div>
          ))}
        </div>
      )}
      {model.items.length > 0 && (
        <ul
          className="mb-1.5 max-h-56 space-y-0.5 overflow-y-auto overscroll-contain border-t border-ds-border-subtle pt-1.5 pr-0.5"
          onWheel={(e) => e.stopPropagation()}
          aria-label={`${model.items.length} movimientos`}
        >
          {model.items.map((it, i) => {
            const clickable = !!it.dteId && !!p.onViewDte;
            const row = (
              <>
                <div className="flex justify-between gap-1">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-status-info-fg">{it.tag}</span>{" "}
                    {it.label}
                  </span>
                  <span className="shrink-0 tabular-nums">{it.amount}</span>
                </div>
                <div className="truncate text-ds-text-4">{it.status}</div>
              </>
            );
            return (
              <li key={i} className="text-[12px] text-ds-text-2">
                {clickable ? (
                  <button
                    type="button"
                    className="w-full rounded px-0.5 text-left hover:bg-ds-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                    aria-label={`Abrir factura ${it.tag}`}
                    onClick={() => p.onViewDte!(it.dteId!)}
                  >
                    {row}
                  </button>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
      {model.execution && (
        <div className="mb-1.5 space-y-0.5 border-t border-ds-border-subtle pt-1.5 text-[12px]">
          <div className="flex items-center justify-between text-ds-text-3">
            <span>Ejecución</span>
            {model.execution.pctLabel && (
              <span className="tabular-nums text-ds-text-2">{model.execution.pctLabel}</span>
            )}
          </div>
          <div className="flex justify-between text-ds-text-2">
            <span>Proyectado</span>
            <span className="tabular-nums">{model.execution.projected}</span>
          </div>
          <div className="flex justify-between text-ds-text-2">
            <span>Real</span>
            <span className="tabular-nums">{model.execution.real}</span>
          </div>
          <div
            className={`flex justify-between ${
              model.execution.state === "over"
                ? "text-status-warn-fg"
                : model.execution.state === "partial"
                  ? "text-status-info-fg"
                  : "text-ds-text-2"
            }`}
          >
            <span>{model.execution.pendingLabel}</span>
            <span className="tabular-nums">{model.execution.pendingValue}</span>
          </div>
        </div>
      )}
      {!model.execution && model.drift && (
        <div className="mb-1.5 space-y-0.5 border-t border-ds-border-subtle pt-1.5 text-[12px]">
          <div className="text-ds-text-3">Desviación</div>
          <div className="flex justify-between text-ds-text-2">
            <span>Proyectado</span><span className="tabular-nums">{model.drift.projected}</span>
          </div>
          <div className="flex justify-between text-ds-text-2">
            <span>Real</span><span className="tabular-nums">{model.drift.real}</span>
          </div>
          <div className={`flex justify-between ${model.drift.positive ? "text-status-ok-fg" : "text-status-danger-fg"}`}>
            <span>Δ</span>
            <span className="tabular-nums">
              {model.drift.delta}
              {model.drift.pct && <span className="ml-1">({model.drift.pct})</span>}
            </span>
          </div>
        </div>
      )}
      {model.pastPending && (
        <p className="mb-1.5 text-[12px] text-ds-text-4">{model.pastPending}</p>
      )}
      {model.term && (
        <div className="mb-1.5 space-y-0.5 border-t border-ds-border-subtle pt-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] uppercase tracking-wide text-ds-text-3">
              Término de pago
            </span>
            {p.canManage && model.term.editable && p.onEditTerm && (
              <button
                type="button"
                className="text-[12px] text-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
                onClick={p.onEditTerm}
              >
                Cambiar…
              </button>
            )}
          </div>
          <p className="text-[12px] leading-snug text-ds-text-2">{model.term.label}</p>
          {model.cession && (
            <p className="text-[12px] text-ds-text-3">
              {model.cession.isRetention
                ? model.cession.dueYmd
                  ? `Retención · liquida ${model.cession.dueYmd.slice(8, 10)}/${model.cession.dueYmd.slice(5, 7)}`
                  : "Retención de cesión"
                : model.cession.funded
                  ? "Anticipo en banco"
                  : `Cedida ${model.cession.pct}%${
                      model.cession.factorName ? ` · ${model.cession.factorName}` : ""
                    }`}
            </p>
          )}
        </div>
      )}
      <div className="border-t border-ds-border-subtle pt-1.5">
        <CellNoteEditor
          rowId={p.rowId}
          weekStart={p.weekStart}
          initial={p.noteInitial}
          canManage={p.canManage}
          save={p.onSaveNote}
          autoFocus={p.focusNote}
          rows={2}
          placeholder="Escribe una nota…"
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-ds-border-subtle pt-1.5">
        <span className="min-w-0 truncate text-[12px] text-ds-text-4">{model.footerHint}</span>
        <span className="flex shrink-0 items-center gap-1">
          {model.cobranza && p.onSendCobranza && p.canManage && (
            <button
              type="button"
              className="inline-flex h-7 items-center rounded border border-status-warn-border bg-status-warn-soft px-1.5 text-[12px] font-medium text-status-warn-fg hover:opacity-90 focus-visible:ring-1 focus-visible:ring-primary/40"
              aria-label={`Cobrar factura vencida · ${model.cobranza.daysOverdue} días de mora`}
              onClick={() => p.onSendCobranza!(model.cobranza!)}
            >
              Cobrar…
            </button>
          )}
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded border border-ds-border-default bg-ds-surface-2 px-1.5 text-[12px] text-ds-text-1 hover:bg-ds-surface-4 focus-visible:ring-1 focus-visible:ring-primary/40"
            onClick={(e) => p.onOpenActions(e.currentTarget)}
          >
            Más… <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        </span>
      </div>
    </>
  );
}
