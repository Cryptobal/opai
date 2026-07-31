"use client";

import { useMemo, useState } from "react";
import {
  AlignJustify, Archive, CheckSquare, ChevronDown, Clock, ListChecks, Mail, MailOpen,
  MoreHorizontal, RefreshCw, ShieldAlert, SlidersHorizontal, Star, Trash2, X,
} from "lucide-react";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";
import { FilterChipsBar, SegmentedControl } from "@/components/opai-ds";
import { CorreoCheckbox } from "./CorreoCheckbox";
import { CorreoFiltersPopover } from "./CorreoFiltersPopover";
import {
  ASSOC_OPTIONS,
  FILTER_FLAG_OPTIONS,
  countActiveFilters,
  type CorreoAssocKey,
  type CorreoFilterFlag,
} from "./CorreosFilters";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";
import type { CorreoToolbarTier } from "./useCorreoWorkspaceLayout";

export type CorreoQuickView = "todos" | "no_leidos" | "con_tareas";

type Props = {
  canModify: boolean;
  allChecked: boolean;
  onToggleAll: () => void;
  onRefresh: () => void;
  syncing: boolean;
  shownCount: number;
  totalCount: number | null;
  searching?: boolean;
  totalIsLowerBound?: boolean;
  previewLines: CorreoPreviewLines;
  onPreviewLines: (lines: CorreoPreviewLines) => void;
  selectedCount: number;
  allReadSelected: boolean;
  onClear: () => void;
  onAction: (action: CorreoAction, okMsg: string, opts?: { undo?: CorreoAction; removes?: boolean }) => void;
  onSnooze: () => void;
  quickView: CorreoQuickView;
  onQuickViewChange: (next: CorreoQuickView) => void;
  assoc: CorreoAssocKey;
  onAssoc: (next: CorreoAssocKey) => void;
  flags: ReadonlySet<CorreoFilterFlag>;
  onToggleFlag: (flag: CorreoFilterFlag) => void;
  onClearFilters: () => void;
  /** Tier responsivo de la columna de lista. */
  tier?: CorreoToolbarTier;
};

const BTN =
  "flex h-7 w-7 items-center justify-center rounded-lg text-ds-text-3 transition-colors ds-tap hover:bg-primary/15 hover:text-primary disabled:opacity-40";
const BTN_DANGER =
  "flex h-7 w-7 items-center justify-center rounded-lg text-ds-text-3 transition-colors ds-tap hover:bg-status-danger-soft hover:text-status-danger-fg disabled:opacity-40";
const BTN_WARN =
  "flex h-7 w-7 items-center justify-center rounded-lg text-ds-text-3 transition-colors ds-tap hover:bg-status-warn-soft hover:text-status-warn-fg disabled:opacity-40";

const SHELL =
  "sticky top-[var(--correo-stick)] z-10 hidden h-[34px] items-center gap-1.5 rounded-t-xl border px-2 lg:flex";

const QUICK_LABELS: Record<CorreoQuickView, string> = {
  todos: "Todos",
  no_leidos: "No leídos",
  con_tareas: "Con tareas",
};

export function CorreosDesktopToolbar({
  canModify, allChecked, onToggleAll, onRefresh, syncing,
  shownCount, totalCount, searching = false, totalIsLowerBound = false,
  previewLines, onPreviewLines,
  selectedCount, allReadSelected, onClear, onAction, onSnooze,
  quickView, onQuickViewChange,
  assoc, onAssoc, flags, onToggleFlag, onClearFilters,
  tier = "wide",
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

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);

  const activeCount = countActiveFilters(assoc, flags);

  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; onClear: () => void }[] = [];
    if (assoc !== "todos") {
      const opt = ASSOC_OPTIONS.find((o) => o.key === assoc);
      if (opt) chips.push({ key: assoc, label: opt.label, onClear: () => onAssoc("todos") });
    }
    for (const flag of FILTER_FLAG_OPTIONS) {
      if (flags.has(flag.key)) {
        chips.push({
          key: flag.key,
          label: flag.label,
          onClear: () => onToggleFlag(flag.key),
        });
      }
    }
    return chips;
  }, [assoc, flags, onAssoc, onToggleFlag]);

  if (selectedCount > 0) {
    return (
      <div className={`${SHELL} gap-1 border-primary/32 bg-primary/14`}>
        <button type="button" aria-label="Salir de la selección" onClick={onClear} className={BTN}>
          <X className="h-3.5 w-3.5" />
        </button>
        <span aria-live="polite" className="mx-1 flex-none whitespace-nowrap text-[13px] font-medium text-primary tabular-nums">
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
        <button type="button" title="Mover a la Papelera" className={BTN_DANGER}
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
        <button type="button" title="Destacar" className={BTN_WARN}
          onClick={() => onAction("star", "Destacados", { undo: "unstar" })}>
          <Star className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Posponer" onClick={onSnooze} className={BTN_WARN}>
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Marcar spam" className={BTN_DANGER}
          onClick={() => onAction("spam", "Marcados como spam", { undo: "unspam", removes: true })}>
          <ShieldAlert className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const showDensityInline = tier === "wide";
  const showSelectInline = tier !== "narrow";
  const showOverflow = tier !== "wide";

  const densityBtn = (
    <button
      type="button"
      title={compact ? "Densidad cómoda" : "Densidad compacta"}
      aria-pressed={compact}
      onClick={() => onPreviewLines(compact ? 2 : 1)}
      className={BTN}
    >
      <AlignJustify className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="hidden lg:block" data-tier={tier}>
      <div className={`${SHELL} min-w-0 border-ds-border-default border-b-ds-border-subtle bg-ds-surface-1`}>
        {showSelectInline && (
          <CorreoCheckbox
            checked={allChecked}
            onChange={onToggleAll}
            disabled={!canModify}
            ariaLabel="Seleccionar todo lo visible"
          />
        )}
        <button
          type="button"
          title={syncing ? "Sincronizando…" : "Sincronizar ahora"}
          onClick={onRefresh}
          disabled={syncing}
          className={BTN}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        </button>

        {tier === "narrow" ? (
          <div className="relative ml-1">
            <button
              type="button"
              onClick={() => setQuickOpen((o) => !o)}
              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium text-ds-text-2 ds-tap hover:bg-primary/10"
            >
              {QUICK_LABELS[quickView]}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {quickOpen && (
              <div className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[140px] rounded-ds-lg border border-ds-border-default bg-ds-surface-2 py-1 shadow-ds-lg">
                {(["todos", "no_leidos", "con_tareas"] as CorreoQuickView[]).map((id) => {
                  const disabled = searching && id !== "todos";
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={disabled}
                      title={disabled ? "No disponible durante la búsqueda" : undefined}
                      onClick={() => {
                        onQuickViewChange(id);
                        setQuickOpen(false);
                      }}
                      className={`flex h-9 w-full items-center px-3 text-left text-[13px] ds-tap disabled:opacity-40 ${
                        quickView === id ? "bg-primary/10 font-medium text-primary" : "text-ds-text-2 hover:bg-ds-surface-3"
                      }`}
                    >
                      {QUICK_LABELS[id]}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <SegmentedControl
            ariaLabel="Vista rápida"
            size="xs"
            className="ml-1 min-w-0 max-w-[min(100%,420px)]"
            value={quickView}
            onChange={onQuickViewChange}
            items={[
              { id: "todos", label: tier === "mid" ? "Todos" : "Todos" },
              {
                id: "no_leidos",
                label: tier === "mid" ? "No leíd." : "No leídos",
                disabled: searching,
                title: searching ? "No disponible durante la búsqueda" : undefined,
              },
              {
                id: "con_tareas",
                label: tier === "mid" ? "Tareas" : "Con tareas",
                icon: ListChecks,
                disabled: searching,
                title: searching ? "No disponible durante la búsqueda" : undefined,
              },
            ]}
          />
        )}

        <CorreoFiltersPopover
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          assoc={assoc}
          onAssoc={onAssoc}
          flags={flags}
          onToggleFlag={onToggleFlag}
          onClear={onClearFilters}
          shownCount={shownCount}
          align="start"
          trigger={
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={`ml-1 inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[12px] font-medium transition-colors ds-tap ${
                activeCount > 0
                  ? "bg-primary/15 text-primary"
                  : "text-ds-text-3 hover:bg-primary/10 hover:text-primary"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
              {tier !== "narrow" && <span>Filtros</span>}
              {activeCount > 0 && (
                <span className="rounded-full bg-primary/20 px-1.5 text-[12px] font-semibold tabular-nums">
                  {activeCount}
                </span>
              )}
            </button>
          }
        />

        <span className="ml-auto flex-none whitespace-nowrap text-[12px] text-ds-text-4 tabular-nums">
          {countLabel}
        </span>
        {showDensityInline && (
          <>
            <span aria-hidden className="h-4 w-px flex-none bg-ds-border-subtle" />
            {densityBtn}
          </>
        )}
        {showOverflow && (
          <div className="relative flex-none">
            <button
              type="button"
              aria-label="Más opciones"
              title="Más opciones"
              onClick={() => setOverflowOpen((o) => !o)}
              className={BTN}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-[180px] rounded-ds-lg border border-ds-border-default bg-ds-surface-2 py-1 shadow-ds-lg">
                {!showSelectInline && (
                  <button
                    type="button"
                    disabled={!canModify}
                    onClick={() => { onToggleAll(); setOverflowOpen(false); }}
                    className="flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-2 ds-tap hover:bg-ds-surface-3 disabled:opacity-40"
                  >
                    <CheckSquare className="h-3.5 w-3.5" /> Seleccionar todo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onPreviewLines(compact ? 2 : 1);
                    setOverflowOpen(false);
                  }}
                  className="flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-2 ds-tap hover:bg-ds-surface-3"
                >
                  <AlignJustify className="h-3.5 w-3.5" />
                  {compact ? "Densidad cómoda" : "Densidad compacta"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <FilterChipsBar
        chips={activeChips}
        onClearAll={onClearFilters}
        className="border-x border-ds-border-subtle bg-ds-surface-1 px-2 py-1"
      />
    </div>
  );
}
