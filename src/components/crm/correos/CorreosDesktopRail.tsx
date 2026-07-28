"use client";

import { Clock, Mail, Menu, PenLine, RefreshCw, Settings, Wifi, WifiOff, Keyboard } from "lucide-react";
import {
  CHIPS, TABS, VERTICAL_LABELS,
  type CorreoChipKey, type CorreoFolderCounts, type CorreoFolderTab,
} from "./CorreosFilters";
import { FOLDER_ICONS, VERTICAL_DOTS } from "./CorreosMobileDrawer";
import type { CorreosRealtimeStatus } from "./useCorreosRealtime";

type Props = {
  folder: CorreoFolderTab;
  onFolder: (f: CorreoFolderTab) => void;
  chip: CorreoChipKey;
  onChip: (c: CorreoChipKey) => void;
  vertical: string | null;
  onVertical: (v: string | null) => void;
  counts: CorreoFolderCounts;
  onCompose: () => void;
  onSync: () => void;
  syncing: boolean;
  realtimeStatus: CorreosRealtimeStatus;
  lastSyncAt: string | null;
  mailboxEmail?: string | null;
  /** Contraído (persistente); con hover hace peek overlay, como Gmail. */
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** Abre configuración de gestos de deslizar (móvil) y atajos de teclado. */
  onOpenSwipeSettings?: () => void;
  onOpenShortcuts?: () => void;
  /** Abre configuración de horarios de posponer. */
  onOpenSnoozeSettings?: () => void;
};

/** Riel de carpetas desktop (reemplaza a las filas de pills): Redactar,
 *  carpetas con contadores, filtros de asociación y verticales, y estado
 *  de sync al pie. Contraíble a 68px con peek al pasar el mouse. */
export function CorreosDesktopRail({
  folder, onFolder, chip, onChip, vertical, onVertical, counts,
  onCompose, onSync, syncing, realtimeStatus, lastSyncAt, mailboxEmail,
  collapsed, onToggleCollapsed, onOpenSwipeSettings, onOpenShortcuts,
  onOpenSnoozeSettings,
}: Props) {
  const live = realtimeStatus === "live";
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null;
  // Con el riel contraído, los textos aparecen solo durante el peek (hover).
  const lbl = collapsed ? "hidden truncate group-hover/rail:inline" : "truncate";
  const item = (active: boolean) =>
    `relative flex h-9 w-full items-center gap-3 rounded-xl text-left text-[13px] ds-tap ${
      collapsed ? "justify-center px-0 group-hover/rail:justify-start group-hover/rail:px-3.5" : "px-3.5"
    } ${active ? "bg-primary/15 font-medium text-primary" : "text-ds-text-2 hover:bg-ds-surface-2"}`;

  return (
    <div
      className={`relative hidden shrink-0 transition-[width] duration-150 lg:block lg:sticky lg:top-16 lg:z-30 lg:h-[calc(100dvh-5rem)] ${
        collapsed ? "w-[68px]" : "w-56"
      }`}
    >
      <div
        className={`group/rail absolute inset-y-0 left-0 z-30 flex flex-col overflow-y-auto overflow-x-hidden rounded-2xl border border-ds-border-default bg-ds-surface-1 px-2 py-2 shadow-ds-xs transition-[width] duration-150 ${
          collapsed ? "w-[68px] hover:w-56 hover:bg-ds-surface-2 hover:shadow-ds-lg" : "w-full"
        }`}
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-label={collapsed ? "Expandir menú de carpetas" : "Contraer menú de carpetas"}
          aria-expanded={!collapsed}
          className={`mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ds-text-3 ds-tap hover:bg-ds-surface-3 ${
            collapsed ? "mx-auto group-hover/rail:mx-1.5" : "mx-1.5"
          }`}
        >
          <Menu className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onCompose}
          className={`mb-2 flex h-11 items-center gap-2.5 rounded-2xl bg-primary/15 text-[13px] font-medium text-primary ds-tap hover:bg-primary/25 ${
            collapsed
              ? "mx-auto w-11 justify-center group-hover/rail:mx-1 group-hover/rail:w-auto group-hover/rail:justify-start group-hover/rail:px-5"
              : "mx-1 px-5"
          }`}
        >
          <PenLine className="h-4 w-4 shrink-0" />
          <span className={lbl}>Redactar</span>
        </button>

        {mailboxEmail && (
          <p
            className={`mb-2 truncate px-3.5 text-[12px] text-ds-text-4 ${collapsed ? "hidden group-hover/rail:block" : ""}`}
            title={mailboxEmail}
          >
            Gmail · {mailboxEmail}
          </p>
        )}

        {TABS.map((t) => {
          const Icon = FOLDER_ICONS[t.key] ?? Mail;
          const n = counts ? (counts as Record<string, number | undefined>)[t.key] : undefined;
          const unread = t.key === "inbox" ? counts?.inboxUnread ?? 0 : 0;
          return (
            <button key={t.key} type="button" onClick={() => onFolder(t.key)} className={item(folder === t.key)}>
              <Icon className="h-4 w-4 shrink-0" />
              <span className={`${lbl} min-w-0 flex-1`}>{t.label}</span>
              {/* Riel colapsado: badge rojo de no leídos sobre el ícono (como
                  Gmail); en el peek/expandido pasa a la píldora inline. */}
              {unread > 0 && collapsed && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-danger px-1 text-[12px] font-semibold leading-none text-white shadow-ds-xs group-hover/rail:hidden"
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
              {unread > 0 && (
                <span className={`rounded-full bg-status-danger px-1.5 text-[12px] font-medium text-white ${collapsed ? "hidden group-hover/rail:inline" : ""}`}>
                  {unread}
                </span>
              )}
              {typeof n === "number" && (
                <span className={`text-[12px] tabular-nums text-ds-text-4 ${collapsed ? "hidden group-hover/rail:inline" : ""}`}>
                  {n}
                </span>
              )}
            </button>
          );
        })}

        <div className={collapsed ? "hidden group-hover/rail:block" : ""}>
          <p className="px-3.5 pb-1 pt-4 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Asociación</p>
          {CHIPS.filter((c) => c.key !== "todos").map((c) => (
            <button key={c.key} type="button"
              onClick={() => onChip(chip === c.key ? "todos" : c.key)}
              className={item(chip === c.key)}>
              <span className={`${lbl} min-w-0 flex-1`}>{c.label}</span>
            </button>
          ))}
          <p className="px-3.5 pb-1 pt-4 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">Verticales</p>
          {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
            <button key={key} type="button"
              onClick={() => onVertical(vertical === key ? null : key)}
              className={item(vertical === key)}>
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${VERTICAL_DOTS[key] ?? "bg-tint-violet"}`} />
              <span className={`${lbl} min-w-0 flex-1`}>{label}</span>
            </button>
          ))}
        </div>

        {(onOpenSwipeSettings || onOpenShortcuts || onOpenSnoozeSettings) && (
          <div className={collapsed ? "hidden group-hover/rail:block" : ""}>
            <p className="px-3.5 pb-1 pt-4 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">
              Configuración
            </p>
            {onOpenSwipeSettings && (
              <button type="button" onClick={onOpenSwipeSettings} className={item(false)}>
                <Settings className="h-4 w-4 shrink-0" />
                <span className={`${lbl} min-w-0 flex-1`}>Gestos de deslizar</span>
              </button>
            )}
            {onOpenSnoozeSettings && (
              <button type="button" onClick={onOpenSnoozeSettings} className={item(false)}>
                <Clock className="h-4 w-4 shrink-0" />
                <span className={`${lbl} min-w-0 flex-1`}>Horarios de posponer</span>
              </button>
            )}
            {onOpenShortcuts && (
              <button type="button" onClick={onOpenShortcuts} className={item(false)}>
                <Keyboard className="h-4 w-4 shrink-0" />
                <span className={`${lbl} min-w-0 flex-1`}>Atajos de teclado</span>
              </button>
            )}
          </div>
        )}

        <div className={`mt-auto flex items-center gap-2 border-t border-ds-border-subtle pt-2 text-[12px] ${collapsed ? "justify-center px-0 group-hover/rail:justify-start group-hover/rail:px-3.5" : "px-3.5"}`}>
          <span className={live ? "text-status-ok-fg" : "text-ds-text-4"}
            title={live ? "Los cambios de Gmail llegan en tiempo real" : "Reconectando; la bandeja se actualiza automáticamente"}>
            {live ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          </span>
          <span className={`${lbl} min-w-0 flex-1 text-ds-text-3`}>
            {live ? "En vivo" : lastSyncLabel ? `Act. ${lastSyncLabel}` : "Reconectando"}
          </span>
          <button type="button" onClick={onSync} disabled={syncing}
            title="Sincronizar ahora"
            className={`items-center gap-1.5 rounded-lg p-1.5 text-ds-text-2 ds-tap hover:bg-ds-surface-3 disabled:opacity-50 ${collapsed ? "hidden group-hover/rail:flex" : "flex"}`}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
