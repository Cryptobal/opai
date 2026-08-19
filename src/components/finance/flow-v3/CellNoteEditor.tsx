"use client";

import { useEffect, useRef, useState } from "react";
import { useCellNoteAutosave } from "./useCellNoteAutosave";

interface Props {
  rowId: string;
  weekStart: string;
  initial: string;
  canManage: boolean;
  save: (
    rowId: string,
    weekStart: string,
    body: string | null,
    opts?: { applyToFuturePlanCells?: boolean },
  ) => Promise<boolean>;
  autoFocus?: boolean;
  rows?: number;
  placeholder?: string;
  onClose?: () => void;
  /** Tras ⌘Enter: flush y cierra solo el editor (mantiene ficha). */
  onEditorDone?: () => void;
  className?: string;
  /** Mostrar opción de aplicar a celdas de plan futuras (default true). */
  showApplyFuture?: boolean;
  /** Altura mínima baja; crece con el texto (máx ~8 líneas). */
  autoGrow?: boolean;
  /** Cabecera más compacta (para panel de composición). */
  compact?: boolean;
}

const STATE_LABEL: Record<string, string> = {
  idle: "",
  saving: "Guardando…",
  saved: "Guardado",
  error: "No se guardó · reintentar",
};

const AUTO_GROW_MAX_PX = 144; // ~8 líneas a 13px + padding

/** Textarea de nota con autoguardado — compartido entre ficha y panel. */
export function CellNoteEditor({
  rowId, weekStart, initial, canManage, save,
  autoFocus, rows = 3, placeholder = "Ej. contador + abogado + prevencionista",
  onClose, onEditorDone, className, showApplyFuture = true,
  autoGrow = false, compact = false,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [applyFuture, setApplyFuture] = useState(false);
  const { draft, setDraft, state, flush, retry } = useCellNoteAutosave({
    rowId,
    weekStart,
    initial,
    save: (r, w, body) =>
      save(r, w, body, applyFuture ? { applyToFuturePlanCells: true } : undefined),
    enabled: canManage,
  });

  useEffect(() => {
    if (!autoFocus || !canManage) return;
    const t = window.setTimeout(() => {
      const el = taRef.current;
      if (!el) return;
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 40);
    return () => window.clearTimeout(t);
  }, [autoFocus, canManage, rowId, weekStart]);

  useEffect(() => {
    if (!autoGrow) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, 28), AUTO_GROW_MAX_PX);
    el.style.height = `${next}px`;
  }, [draft, autoGrow, canManage]);

  if (!canManage) {
    const text = initial.trim();
    if (!text) {
      return (
        <p className={`text-[12px] text-ds-text-4 ${className ?? ""}`}>
          Sin nota.
        </p>
      );
    }
    return (
      <p className={`whitespace-pre-wrap text-[13px] leading-snug text-ds-text-2 ${className ?? ""}`}>
        {text}
      </p>
    );
  }

  return (
    <div className={className}>
      <div className={`flex items-center justify-between gap-2 ${compact ? "mb-0.5" : "mb-1"}`}>
        <span className="text-[12px] text-ds-text-3">
          {compact ? "Nota" : "Nota / desglose"}
        </span>
        {state !== "idle" && (
          <button
            type="button"
            disabled={state !== "error"}
            onClick={() => state === "error" && retry()}
            className={`text-[12px] ${
              state === "error" ? "text-status-danger-fg underline-offset-2 hover:underline" : "text-ds-text-4"
            }`}
          >
            {STATE_LABEL[state]}
          </button>
        )}
      </div>
      <textarea
        ref={taRef}
        value={draft}
        maxLength={2000}
        rows={autoGrow ? 1 : rows}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { void flush(); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            void flush().then(() => onClose?.());
            return;
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void flush().then(() => onEditorDone?.());
          }
        }}
        className={`w-full rounded border border-ds-border-subtle bg-ds-surface-1 px-1.5 py-1 text-[13px] leading-snug text-ds-text-1 placeholder:text-ds-text-4 focus:border-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40 ${
          autoGrow ? "resize-none overflow-y-auto" : "resize-none"
        }`}
      />
      {showApplyFuture && (
        <label className={`flex min-h-9 cursor-pointer items-start gap-2 text-[12px] text-ds-text-3 ${compact ? "mt-1" : "mt-1.5"}`}>
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-ds-border-default"
            checked={applyFuture}
            onChange={(e) => {
              const checked = e.target.checked;
              setApplyFuture(checked);
              if (checked) {
                void save(rowId, weekStart, draft.trim() || null, {
                  applyToFuturePlanCells: true,
                });
              }
            }}
          />
          <span>
            Aplicar a todas las celdas de plan futuras de esta fila
            {!compact && (
              <span className="block text-ds-text-4">
                Útil si el desglose se repite (ej. asesores cada mes).
              </span>
            )}
          </span>
        </label>
      )}
    </div>
  );
}
