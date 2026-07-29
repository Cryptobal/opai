"use client";

import {
  AlignJustify, Archive, CheckSquare, Clock, Mail, MailOpen, RefreshCw,
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
  /** Si true, el contador usa wording «N resultados» (búsqueda activa). */
  searching?: boolean;
  /** true cuando el total de búsqueda es un piso (alcanzó overfetch). */
  totalIsLowerBound?: boolean;
  previewLines: CorreoPreviewLines;
  onPreviewLines: (lines: CorreoPreviewLines) => void;
  /** Selección activa: la barra muta a acciones masivas (bulkAction del cliente). */
  selectedCount: number;
  allReadSelected: boolean;
  onClear: () => void;
  onAction: (action: CorreoAction, okMsg: string, opts?: { undo?: CorreoAction; removes?: boolean }) => void;
  onSnooze: () => void;
};

const BTN =
  "flex h-7 w-7 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-2 hover:text-ds-text-1 disabled:opacity-40";

const SHELL =
  "sticky top-[var(--correo-stick)] z-10 hidden h-[34px] items-center gap-1.5 rounded-t-xl border px-2 lg:flex";

/** Cabecera de lista desktop (34 px): alta frecuencia en reposo; acciones
 *  masivas en selección. Atajos viven en el riel; búsqueda en el topbar. */
export function CorreosDesktopToolbar({
  canModify, allChecked, onToggleAll, onRefresh, syncing,
  shownCount, totalCount, searching = false, totalIsLowerBound = false,
  previewLines, onPreviewLines,
  selectedCount, allReadSelected, onClear, onAction, onSnooze,
}: Props) {
  const compact = previewLines === 1;
  const boundSuffix = searching && totalIsLowerBound ? "+" : "";
  const countLabel =
    totalCount == null
      ? `${shownCount} hilos`
      : searching
        ? totalCount === shownCount && !totalIsLowerBound
          ? `${shownCount} resultado${shownCount === 1 ? "" : "s"}`
          : `${shownCount} de ${totalCount}${boundSuffix}`
        : `${shownCount} de ${totalCount}`;

  if (selectedCount > 0) {
    return (
      <div className={`${SHELL} gap-1 border-primary/32 bg-primary/14`}>
        <button type="button" aria-label="Salir de la selección" onClick={onClear} className={BTN}>
          <X className="h-3.5 w-3.5" />
        </button>
        <span aria-live="polite" className="mx-1 text-[13px] font-medium text-primary tabular-nums">
          {selectedCount} seleccionados
        </span>
        <button type="button" title="Seleccionar todo lo visible" onClick={onToggleAll} className={BTN}>
          <CheckSquare className="h-3.5 w-3.5" />
        </button>
        <span aria-hidden className="mx-1 h-4 w-px bg-primary/25" />
        <button type="button" title="Archivar" className={BTN}
          onClick={() => onAction("archive", "Archivados", { undo: "unarchive", removes: true })}>
          <Archive className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Mover a la Papelera" className={BTN}
          onClick={() => onAction("trash", "Movidos a la Papelera", { undo: "untrash", removes: true })}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" title={allReadSelected ? "Marcar no leídos" : "Marcar leídos"} className={BTN}
          onClick={() =>
            allReadSelected
              ? onAction("markUnread", "Marcados como no leídos", { undo: "markRead" })
              : onAction("markRead", "Marcados como leídos", { undo: "markUnread" })
          }>
          {allReadSelected ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
        </button>
        <button type="button" title="Destacar" className={BTN}
          onClick={() => onAction("star", "Destacados", { undo: "unstar" })}>
          <Star className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Posponer" onClick={onSnooze} className={BTN}>
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Marcar spam" className={BTN}
          onClick={() => onAction("spam", "Marcados como spam", { undo: "unspam", removes: true })}>
          <ShieldAlert className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className={`${SHELL} border-ds-border-default border-b-ds-border-subtle bg-ds-surface-1`}>
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
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      </button>
      <span className="ml-auto text-[12px] text-ds-text-4 tabular-nums">
        {countLabel}
      </span>
      <span aria-hidden className="h-4 w-px bg-ds-border-subtle" />
      <button
        type="button"
        title={compact ? "Densidad cómoda" : "Densidad compacta"}
        aria-pressed={compact}
        onClick={() => onPreviewLines(compact ? 2 : 1)}
        className={BTN}
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
