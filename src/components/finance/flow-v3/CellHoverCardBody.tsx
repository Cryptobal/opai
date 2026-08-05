"use client";

import { ChevronDown } from "lucide-react";
import { Tag } from "@/components/opai-ds";
import type { HoverCardModel } from "./cell-hover-content";
import { CellNoteEditor } from "./CellNoteEditor";

interface Props {
  model: HoverCardModel;
  editingNote: boolean;
  canManage: boolean;
  rowId: string;
  weekStart: string;
  noteInitial: string;
  onSaveNote: (rowId: string, weekStart: string, body: string | null) => Promise<boolean>;
  onStartNote: () => void;
  onNoteClose: () => void;
  onNoteDone: () => void;
  onOpenActions: (el: HTMLElement) => void;
}

/** Cuerpo presentacional de la ficha de detalle (clic en desktop). */
export function CellHoverCardBody(p: Props) {
  const { model } = p;
  return (
    <>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate font-medium text-ds-text-1">{model.concept}</span>
        <span className="shrink-0 text-[12px] tabular-nums text-ds-text-3">
          {model.ref} · {model.weekLabel}
        </span>
      </div>
      <div className="mb-1.5 flex flex-wrap gap-1">
        {model.badges.map((b) => (
          <Tag key={b} size="sm" variant={b === "manual" ? "brand" : "neutral"}>{b}</Tag>
        ))}
      </div>
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
        <ul className="mb-1.5 max-h-24 space-y-0.5 overflow-y-auto border-t border-ds-border-subtle pt-1.5">
          {model.items.map((it, i) => (
            <li key={i} className="text-[12px] text-ds-text-2">
              <div className="flex justify-between gap-1">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-status-info-fg">{it.tag}</span> {it.label}
                </span>
                <span className="shrink-0 tabular-nums">{it.amount}</span>
              </div>
              <div className="truncate text-ds-text-4">{it.status}</div>
            </li>
          ))}
          {model.itemsMore > 0 && (
            <li className="text-[12px] text-ds-text-4">+{model.itemsMore} más</li>
          )}
        </ul>
      )}
      {model.drift && (
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
      <div className="border-t border-ds-border-subtle pt-1.5">
        {p.editingNote ? (
          <CellNoteEditor
            rowId={p.rowId}
            weekStart={p.weekStart}
            initial={p.noteInitial}
            canManage={p.canManage}
            save={p.onSaveNote}
            autoFocus
            rows={3}
            onClose={p.onNoteClose}
            onEditorDone={p.onNoteDone}
          />
        ) : (
          <button
            type="button"
            onClick={p.onStartNote}
            className="w-full rounded px-0.5 text-left hover:bg-ds-surface-2 focus-visible:ring-1 focus-visible:ring-primary/40"
          >
            <div className="mb-0.5 flex items-center justify-between">
              <span className="text-[12px] uppercase tracking-wide text-ds-text-3">Nota</span>
              {p.canManage && (
                <span className="text-[12px] text-ds-text-4">clic para editar</span>
              )}
            </div>
            <p className="whitespace-pre-wrap text-[13px] text-ds-text-2">
              {model.note || "Sin nota"}
            </p>
          </button>
        )}
      </div>
      {!p.editingNote && (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-ds-border-subtle pt-1.5">
          <span className="truncate text-[12px] text-ds-text-4">{model.footerHint}</span>
          <button
            type="button"
            className="inline-flex h-7 shrink-0 items-center gap-0.5 rounded border border-ds-border-default bg-ds-surface-2 px-1.5 text-[12px] text-ds-text-1 hover:bg-ds-surface-4 focus-visible:ring-1 focus-visible:ring-primary/40"
            onClick={(e) => p.onOpenActions(e.currentTarget)}
          >
            Acciones <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
        </div>
      )}
    </>
  );
}
