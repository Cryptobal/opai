"use client";

import { useEffect, useRef } from "react";
import { useCellNoteAutosave } from "./useCellNoteAutosave";

interface Props {
  rowId: string;
  weekStart: string;
  initial: string;
  canManage: boolean;
  save: (rowId: string, weekStart: string, body: string | null) => Promise<boolean>;
  autoFocus?: boolean;
  rows?: number;
  onClose?: () => void;
  /** Tras ⌘Enter: flush y cierra solo el editor (mantiene ficha). */
  onEditorDone?: () => void;
  className?: string;
}

const STATE_LABEL: Record<string, string> = {
  idle: "",
  saving: "Guardando…",
  saved: "Guardado",
  error: "No se guardó · reintentar",
};

/** Textarea de nota con autoguardado — compartido entre ficha y panel. */
export function CellNoteEditor({
  rowId, weekStart, initial, canManage, save,
  autoFocus, rows = 3, onClose, onEditorDone, className,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const { draft, setDraft, state, flush, retry } = useCellNoteAutosave({
    rowId, weekStart, initial, save, enabled: canManage,
  });

  useEffect(() => {
    if (!autoFocus || !canManage) return;
    const t = window.setTimeout(() => taRef.current?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [autoFocus, canManage, rowId, weekStart]);

  if (!canManage) {
    return (
      <p className={`whitespace-pre-wrap text-[13px] text-ds-text-2 ${className ?? ""}`}>
        {initial.trim() || "Sin nota."}
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[12px] text-ds-text-3">Nota</span>
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
        rows={rows}
        placeholder="Motivo del cambio o desvío…"
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
        className="w-full resize-none rounded border border-ds-border-subtle bg-ds-surface-1 px-1.5 py-1 text-[13px] text-ds-text-1 placeholder:text-ds-text-4 focus:border-primary focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
      />
    </div>
  );
}
