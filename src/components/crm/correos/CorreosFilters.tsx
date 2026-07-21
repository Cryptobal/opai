"use client";

import { RefreshCw, Search } from "lucide-react";

export type CorreoFolderTab = "inbox" | "archived" | "all" | "trash" | "snoozed";
export type CorreoChipKey = "todos" | "con_cuenta" | "sin_asociar" | "con_adjuntos" | "leads_creados";

// Espejo de Gmail: no hay bandeja "Archivados" — los archivados viven dentro
// de "Todos". El tipo `archived` se mantiene solo por compat de deep-links.
const TABS: { key: CorreoFolderTab; label: string }[] = [
  { key: "inbox", label: "Recibidos" },
  { key: "snoozed", label: "Pospuestos" },
  { key: "all", label: "Todos" },
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
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ds-text-4" />
          <input
            className="h-10 w-full rounded-xl border border-ds-border-default bg-ds-surface-1 pl-9 pr-3 text-[13px] sm:h-9"
            placeholder="Buscar por asunto, remitente…"
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
      </div>

      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map((t) => {
          const n = counts?.[t.key];
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
                  className={`ml-1.5 rounded-full px-1.5 text-[11px] font-medium ${
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
