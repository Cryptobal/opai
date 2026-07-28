"use client";

import { useRef, type ReactNode } from "react";
import {
  AlignJustify, CalendarClock, Clock, Inbox, Keyboard, Mail, Pencil, RefreshCw,
  Send, Settings, ShieldAlert, Star, Trash2, Wifi, WifiOff, X,
  type LucideIcon,
} from "lucide-react";
import { VERTICAL_META } from "@/modules/crm/email/radar-types";
import {
  CHIPS, TABS, VERTICAL_LABELS,
  type CorreoChipKey, type CorreoFolderCounts, type CorreoFolderTab,
} from "./CorreosFilters";
import type { CorreosRealtimeStatus } from "./useCorreosRealtime";
import type { CorreoPreviewLines } from "./useCorreosViewPreferences";
import { useCloseOnBack } from "./useCloseOnBack";
import { useFocusTrap } from "./useFocusTrap";

// Export: el riel desktop reusa los mismos iconos y puntos categóricos.
export const FOLDER_ICONS: Partial<Record<CorreoFolderTab, LucideIcon>> = {
  inbox: Inbox, snoozed: Clock, sent: Send, drafts: Pencil,
  scheduled: CalendarClock, starred: Star, all: Mail, spam: ShieldAlert, trash: Trash2,
};

/** Punto categórico por vertical (tokens tint-*-fg / status del DS). */
export const VERTICAL_DOTS: Record<string, string> = Object.fromEntries(
  Object.entries(VERTICAL_META).map(([key, meta]) => [key, meta.dot]),
);

type Props = {
  open: boolean;
  onClose: () => void;
  folder: CorreoFolderTab;
  onFolder: (f: CorreoFolderTab) => void;
  chip: CorreoChipKey;
  onChip: (c: CorreoChipKey) => void;
  vertical: string | null;
  onVertical: (v: string | null) => void;
  counts: CorreoFolderCounts;
  previewLines: CorreoPreviewLines;
  onPreviewLines: (lines: CorreoPreviewLines) => void;
  onSync: () => void;
  syncing: boolean;
  realtimeStatus: CorreosRealtimeStatus;
  lastSyncAt: string | null;
  /** Casilla Gmail conectada (se muestra en el encabezado del drawer). */
  mailboxEmail?: string | null;
  /** Abre el sheet de configuración de gestos (Bloque 6). */
  onOpenSwipeSettings?: () => void;
  /** Abre el sheet de horarios de posponer. */
  onOpenSnoozeSettings?: () => void;
  /** Abre el sheet de atajos de teclado configurables. */
  onOpenShortcuts?: () => void;
  /** Inserta un operador en la caja de búsqueda (ayuda móvil). */
  onInsertSearch?: (token: string) => void;
};

const SEARCH_OPS = [
  "from:",
  "subject:",
  "has:attachment",
  "is:unread",
  "vertical:",
  "newer_than:7d",
] as const;

function Item({ active, onClick, children }: { active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] ds-tap ${
        active ? "bg-primary/15 font-medium text-primary" : "text-ds-text-2"
      }`}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <p className="px-3 pb-1 pt-4 text-[11px] font-mono uppercase tracking-[0.08em] text-ds-text-4">{children}</p>;
}

/** Drawer lateral móvil (Opción C): carpetas, filtros y acciones del módulo. */
export function CorreosMobileDrawer({
  open, onClose, folder, onFolder, chip, onChip, vertical, onVertical, counts,
  previewLines, onPreviewLines, onSync, syncing, realtimeStatus, lastSyncAt,
  mailboxEmail, onOpenSwipeSettings, onOpenSnoozeSettings, onOpenShortcuts,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useCloseOnBack(open, onClose);
  useFocusTrap(panelRef, { active: open, trap: true, onEscape: onClose });
  if (!open) return null;

  const pick = (apply: () => void) => () => { apply(); onClose(); };
  const live = realtimeStatus === "live";
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="fixed inset-0 z-[45] lg:hidden">
      <div className="absolute inset-0 bg-black/55 animate-in fade-in duration-200" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Carpetas y filtros de correo"
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[82%] max-w-[340px] flex-col overflow-y-auto bg-ds-surface-1 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] shadow-ds-lg animate-in slide-in-from-left duration-200"
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-semibold text-ds-text-1">Correos</p>
            {mailboxEmail ? (
              <p className="truncate text-[12px] text-ds-text-3" title={mailboxEmail}>
                Gmail · {mailboxEmail}
              </p>
            ) : (
              <p className="text-[12px] text-ds-text-4">Cuenta Gmail</p>
            )}
          </div>
          <button type="button" aria-label="Cerrar menú" onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ds-text-3 ds-tap">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="px-2">
          <SectionTitle>Carpetas</SectionTitle>
          {TABS.map((t) => {
            const Icon = FOLDER_ICONS[t.key] ?? Mail;
            const n = counts ? (counts as Record<string, number | undefined>)[t.key] : undefined;
            const unread = t.key === "inbox" ? counts?.inboxUnread ?? 0 : 0;
            return (
              <Item key={t.key} active={folder === t.key} onClick={pick(() => onFolder(t.key))}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t.label}</span>
                {unread > 0 && (
                  <span className="rounded-full bg-status-danger px-1.5 text-[12px] font-medium text-white">{unread}</span>
                )}
                {typeof n === "number" && <span className="text-[12px] text-ds-text-4">{n}</span>}
              </Item>
            );
          })}

          <SectionTitle>Asociación</SectionTitle>
          {CHIPS.map((c) => (
            <Item key={c.key} active={chip === c.key} onClick={pick(() => onChip(c.key))}>
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
            </Item>
          ))}

          <SectionTitle>Verticales</SectionTitle>
          {Object.entries(VERTICAL_LABELS).map(([key, label]) => (
            <Item key={key} active={vertical === key} onClick={pick(() => onVertical(vertical === key ? null : key))}>
              <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${VERTICAL_DOTS[key] ?? "bg-tint-violet"}`} />
              <span className="min-w-0 flex-1 truncate">{label}</span>
            </Item>
          ))}

          <SectionTitle>Configuración</SectionTitle>
          {/* Densidad: selector Liquid Glass (elegir 1/2/3 líneas), no un ciclo
              que rota y se cierra. Se aplica en vivo y el drawer queda abierto. */}
          <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-1.5">
            <div className="flex min-w-0 items-center gap-3">
              <AlignJustify className="h-4 w-4 shrink-0 text-ds-text-2" />
              <span className="truncate text-[13px] text-ds-text-2">Densidad</span>
            </div>
            <div
              role="group"
              aria-label="Líneas de vista previa"
              className="opai-glass-pill inline-flex shrink-0 items-center gap-0.5 rounded-full p-0.5"
            >
              {([1, 2, 3] as CorreoPreviewLines[]).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onPreviewLines(n)}
                  aria-pressed={previewLines === n}
                  aria-label={`${n} ${n === 1 ? "línea" : "líneas"}`}
                  className={`inline-flex h-9 min-w-[38px] items-center justify-center rounded-full px-2 text-[13px] font-medium ds-tap ${
                    previewLines === n
                      ? "bg-primary text-primary-foreground"
                      : "text-ds-text-2"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {onOpenSwipeSettings && (
            <Item onClick={pick(onOpenSwipeSettings)}>
              <Settings className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Gestos de deslizar</span>
            </Item>
          )}
          {onOpenSnoozeSettings && (
            <Item onClick={pick(onOpenSnoozeSettings)}>
              <Clock className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Horarios de posponer</span>
            </Item>
          )}
          {onOpenShortcuts && (
            <Item onClick={pick(onOpenShortcuts)}>
              <Keyboard className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">Atajos de teclado</span>
            </Item>
          )}
        </nav>

        <div className="mt-2 border-t border-ds-border-subtle px-2 pb-3 pt-1">
          <Item onClick={onSync}>
            <RefreshCw className={`h-4 w-4 shrink-0 ${syncing ? "animate-spin" : ""}`} />
            <span className="min-w-0 flex-1 truncate">{syncing ? "Sincronizando…" : "Sincronizar ahora"}</span>
            <span className={`inline-flex items-center gap-1 text-[12px] ${live ? "text-status-ok-fg" : "text-ds-text-4"}`}>
              {live ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {live ? "En vivo" : lastSyncLabel ?? "Reconectando"}
            </span>
          </Item>
        </div>
      </div>
    </div>
  );
}
