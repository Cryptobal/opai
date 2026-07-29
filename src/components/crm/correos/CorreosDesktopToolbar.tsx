"use client";

import {
  AlignJustify, Archive, CheckSquare, Clock, Keyboard, Mail, MailOpen, RefreshCw,
  ShieldAlert, Star, Trash2, X,
} from "lucide-react";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";
import { CorreoCheckbox } from "./CorreoCheckbox";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";

type Props = {
  canModify: boolean;
  allChecked: boolean;
  onToggleAll: () => void;
  /** Sincroniza Gmail (no solo recarga la lista): trae correos nuevos y
   *  reconcilia carpetas/borradores, como el refresh de Gmail. */
  onRefresh: () => void;
  syncing: boolean;
  shownCount: number;
  totalCount: number | null;
  previewLines: CorreoPreviewLines;
  onPreviewLines: (lines: CorreoPreviewLines) => void;
  /** Selección activa: la barra muta a acciones masivas (bulkAction del cliente). */
  selectedCount: number;
  allReadSelected: boolean;
  onClear: () => void;
  onAction: (action: CorreoAction, okMsg: string, opts?: { undo?: CorreoAction; removes?: boolean }) => void;
  onSnooze: () => void;
  /** Abre el sheet de atajos de teclado configurables. */
  onOpenShortcuts?: () => void;
};

const BTN = "flex h-8 w-8 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-40";

/** Toolbar desktop: seleccionar todo, sync, densidad y atajos; con selección
 *  activa muta a acciones masivas. La búsqueda vive en el topbar (overlay). */
export function CorreosDesktopToolbar({
  canModify, allChecked, onToggleAll, onRefresh, syncing,
  shownCount, totalCount, previewLines, onPreviewLines,
  selectedCount, allReadSelected, onClear, onAction, onSnooze, onOpenShortcuts,
}: Props) {
  const compact = previewLines === 1;

  if (selectedCount > 0) {
    return (
      <div className="sticky top-[var(--correo-stick)] z-10 hidden h-12 items-center gap-1 rounded-xl border border-primary/30 bg-primary/15 px-2 backdrop-blur lg:flex">
        <button type="button" aria-label="Salir de la selección" onClick={onClear} className={BTN}>
          <X className="h-4 w-4" />
        </button>
        <span aria-live="polite" className="mx-1 text-[13px] font-medium text-primary tabular-nums">
          {selectedCount} seleccionados
        </span>
        <button type="button" title="Seleccionar todo lo visible" onClick={onToggleAll} className={BTN}>
          <CheckSquare className="h-4 w-4" />
        </button>
        <span aria-hidden className="mx-1 h-5 w-px bg-primary/25" />
        <button type="button" title="Archivar" className={BTN}
          onClick={() => onAction("archive", "Archivados", { undo: "unarchive", removes: true })}>
          <Archive className="h-4 w-4" />
        </button>
        <button type="button" title="Mover a la Papelera" className={BTN}
          onClick={() => onAction("trash", "Movidos a la Papelera", { undo: "untrash", removes: true })}>
          <Trash2 className="h-4 w-4" />
        </button>
        <button type="button" title={allReadSelected ? "Marcar no leídos" : "Marcar leídos"} className={BTN}
          onClick={() =>
            allReadSelected
              ? onAction("markUnread", "Marcados como no leídos", { undo: "markRead" })
              : onAction("markRead", "Marcados como leídos", { undo: "markUnread" })
          }>
          {allReadSelected ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
        </button>
        <button type="button" title="Destacar" className={BTN}
          onClick={() => onAction("star", "Destacados", { undo: "unstar" })}>
          <Star className="h-4 w-4" />
        </button>
        <button type="button" title="Posponer" onClick={onSnooze} className={BTN}>
          <Clock className="h-4 w-4" />
        </button>
        <button type="button" title="Marcar spam" className={BTN}
          onClick={() => onAction("spam", "Marcados como spam", { undo: "unspam", removes: true })}>
          <ShieldAlert className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-[var(--correo-stick)] z-10 hidden h-12 items-center gap-2 rounded-xl border border-ds-border-default bg-background/95 px-3 backdrop-blur lg:flex">
      <CorreoCheckbox
        checked={allChecked}
        onChange={onToggleAll}
        disabled={!canModify}
        ariaLabel="Seleccionar todo lo visible"
      />
      <button
        type="button"
        title={syncing ? "Sincronizando…" : "Sincronizar ahora"}
        onClick={onRefresh}
        disabled={syncing}
        className={BTN}
      >
        <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
      </button>
      <span className="ml-auto text-[12px] text-ds-text-4 tabular-nums">
        {totalCount != null ? `${shownCount} de ${totalCount}` : `${shownCount} hilos`}
      </span>
      <button
        type="button"
        title={compact ? "Densidad cómoda" : "Densidad compacta"}
        aria-pressed={compact}
        onClick={() => onPreviewLines(compact ? 2 : 1)}
        className={BTN}
      >
        <AlignJustify className="h-4 w-4" />
      </button>
      {onOpenShortcuts && (
        <button
          type="button"
          title="Atajos de teclado (?)"
          onClick={onOpenShortcuts}
          className={BTN}
        >
          <Keyboard className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
