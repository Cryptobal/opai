"use client";

import { AlignJustify, RefreshCw, Search, Wifi, WifiOff } from "lucide-react";
import type { CorreosRealtimeStatus } from "./useCorreosRealtime";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";

export type CorreoFolderTab =
  | "inbox"
  | "archived"
  | "all"
  | "trash"
  | "snoozed"
  | "sent"
  | "drafts"
  | "spam"
  | "starred"
  | "scheduled";
export type CorreoChipKey = "todos" | "con_cuenta" | "sin_asociar" | "con_adjuntos" | "leads_creados";

// Espejo de Gmail: no hay bandeja "Archivados" — los archivados viven dentro
// de "Todos". El tipo `archived` se mantiene solo por compat de deep-links.
// "Programados" (PR-12) se alimenta del outbox, no de hilos.
const TABS: { key: CorreoFolderTab; label: string }[] = [
  { key: "inbox", label: "Bandeja de entrada" },
  { key: "snoozed", label: "Pospuestos" },
  { key: "sent", label: "Enviados" },
  { key: "drafts", label: "Borradores" },
  { key: "scheduled", label: "Programados" },
  { key: "starred", label: "Destacados" },
  { key: "all", label: "Todos" },
  { key: "spam", label: "Spam" },
  { key: "trash", label: "Papelera" },
];

const CHIPS: { key: CorreoChipKey; label: string }[] = [
  { key: "todos", label: "Todas las asociaciones" },
  { key: "con_cuenta", label: "Con cuenta" },
  { key: "sin_asociar", label: "Sin asociar" },
  { key: "con_adjuntos", label: "Con adjuntos" },
  { key: "leads_creados", label: "Leads creados" },
];

type Counts = {
  inbox: number;
  inboxUnread?: number;
  archived: number;
  all: number;
  trash: number;
  snoozed: number;
  drafts?: number;
  spam?: number;
  scheduled?: number;
} | null;

type Props = {
  folder: CorreoFolderTab;
  onFolder: (f: CorreoFolderTab) => void;
  chip: CorreoChipKey;
  onChip: (c: CorreoChipKey) => void;
  counts: Counts;
  query: string;
  onQuery: (q: string) => void;
  onSync: () => void;
  syncing: boolean;
  realtimeStatus: CorreosRealtimeStatus;
  previewLines: CorreoPreviewLines;
  onPreviewLines: (lines: CorreoPreviewLines) => void;
  lastSyncAt: string | null;
};

export function CorreosFilters({
  folder,
  onFolder,
  chip,
  onChip,
  counts,
  query,
  onQuery,
  onSync,
  syncing,
  realtimeStatus,
  previewLines,
  onPreviewLines,
  lastSyncAt,
}: Props) {
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
          <input
            id="correos-search-input"
            className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 pl-9 pr-3 text-[13px] sm:h-9"
            placeholder="Buscar en toda la casilla (from: to: domain: before: after: has:attachment)"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-ds-border-default px-3 text-[13px] ds-tap disabled:opacity-50 sm:h-9"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
        <span
          className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-[12px] sm:h-9 ${
            realtimeStatus === "live"
              ? "text-status-ok-fg"
              : "text-ds-text-3"
          }`}
          aria-live="polite"
          title={
            realtimeStatus === "live"
              ? "Los cambios de Gmail llegan en tiempo real"
              : "Reconectando; la bandeja se actualiza automáticamente"
          }
        >
          {realtimeStatus === "live" ? (
            <Wifi className="h-4 w-4" />
          ) : (
            <WifiOff className="h-4 w-4" />
          )}
          {realtimeStatus === "live"
            ? "En vivo"
            : lastSyncLabel
              ? `Actualizado ${lastSyncLabel}`
              : "Reconectando"}
        </span>
        <label className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-ds-border-default bg-ds-surface-1 px-2 text-[12px] text-ds-text-2 sm:h-9">
          <AlignJustify className="h-4 w-4" />
          <span className="sr-only">Líneas de vista previa</span>
          <select
            value={previewLines}
            onChange={(event) =>
              onPreviewLines(Number(event.target.value) as CorreoPreviewLines)
            }
            className="h-full border-0 bg-transparent pr-5 text-[12px] text-ds-text-2 outline-none"
            aria-label="Líneas de vista previa"
          >
            <option value={1}>1 línea</option>
            <option value={2}>2 líneas</option>
            <option value={3}>3 líneas</option>
          </select>
        </label>
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const n = counts
            ? (counts as Record<string, number | undefined>)[t.key]
            : undefined;
          const unread = t.key === "inbox" ? counts?.inboxUnread ?? 0 : 0;
          const active = folder === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onFolder(t.key)}
              className={`inline-flex h-10 shrink-0 items-center rounded-xl px-3 text-[13px] ds-tap sm:h-9 ${
                active ? "bg-primary text-primary-foreground" : "bg-ds-surface-2 text-ds-text-2"
              }`}
            >
              {t.label}
              {typeof n === "number" ? (
                <span className="ml-1.5 opacity-80">{n}</span>
              ) : null}
              {unread > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 text-[12px] font-medium ${
                    active
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  {unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => onChip(c.key)}
            className={`h-9 rounded-full px-3 text-[12px] ds-tap ${
              chip === c.key
                ? "bg-primary text-primary-foreground"
                : "bg-ds-surface-2 text-ds-text-2"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
