"use client";

import { useState } from "react";
import {
  Archive, CheckSquare, Clock, Mail, MailOpen, MoreVertical, ShieldAlert,
  Star, Trash2, X,
} from "lucide-react";
import { Surface } from "@/components/opai-ds";
import type { CorreoAction } from "@/modules/crm/email/gmail-thread-actions";

type Props = {
  count: number;
  /** Todos los seleccionados leídos → el toggle ofrece "No leído". */
  allRead: boolean;
  onClear: () => void;
  /** bulkAction del cliente: remoción optimista + clear + runBulkCorreoAction. */
  onAction: (
    action: CorreoAction,
    okMsg: string,
    opts?: { undo?: CorreoAction; removes?: boolean },
  ) => void;
  /** Abre CorreoSnoozeSheet en modo __bulk__. */
  onSnooze: () => void;
  onSelectAllVisible: () => void;
};

const ICON_BTN =
  "inline-flex h-11 w-11 items-center justify-center rounded-full text-ds-text-2 ds-tap";

/**
 * Barra contextual del modo selección móvil (estilo Gmail): reemplaza a la
 * píldora de búsqueda mientras hay seleccionados. X + contador + acciones
 * rápidas y overflow con el resto. Desktop sigue usando CorreoBulkBar.
 */
export function CorreoSelectionBar({
  count, allRead, onClear, onAction, onSnooze, onSelectAllVisible,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const run = (fn: () => void) => () => { setMenuOpen(false); fn(); };

  return (
    // fixed (no sticky): mismo criterio que CorreosMobileTopBar / MobileIsland —
    // en PWA el rubber-band despega sticky y arrastra la barra.
    <div
      className="fixed inset-x-0 top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85 animate-in fade-in slide-in-from-top-2 duration-150 lg:hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="flex items-center gap-1 px-2 pb-1.5 pt-2">
        <button type="button" aria-label="Salir de la selección" onClick={onClear} className={ICON_BTN}>
          <X className="h-5 w-5" />
        </button>
        <span aria-live="polite" className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ds-text-1">
          {count}
        </span>
        <button
          type="button"
          aria-label="Archivar seleccionados"
          onClick={run(() => onAction("archive", "Archivados", { undo: "unarchive", removes: true }))}
          className={ICON_BTN}
        >
          <Archive className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label="Mover seleccionados a la papelera"
          onClick={run(() => onAction("trash", "Movidos a la Papelera", { undo: "unarchive", removes: true }))}
          className={ICON_BTN}
        >
          <Trash2 className="h-5 w-5" />
        </button>
        <button
          type="button"
          aria-label={allRead ? "Marcar como no leídos" : "Marcar como leídos"}
          onClick={run(() =>
            allRead
              ? onAction("markUnread", "Marcados como no leídos", { undo: "markRead" })
              : onAction("markRead", "Marcados como leídos", { undo: "markUnread" }),
          )}
          className={ICON_BTN}
        >
          {allRead ? <Mail className="h-5 w-5" /> : <MailOpen className="h-5 w-5" />}
        </button>
        <button
          type="button"
          aria-label="Más acciones"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className={ICON_BTN}
        >
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden />
          <Surface
            elevation={4}
            padding="none"
            className="absolute right-2 top-full z-20 mt-1 w-56 overflow-hidden py-1"
          >
            {[
              { label: "Destacar", icon: Star, onPick: run(() => onAction("star", "Destacados", { undo: "unstar" })) },
              { label: "Posponer", icon: Clock, onPick: run(onSnooze) },
              { label: "Marcar spam", icon: ShieldAlert, onPick: run(() => onAction("spam", "Marcados como spam", { undo: "unspam", removes: true })) },
              { label: "Seleccionar todo", icon: CheckSquare, onPick: run(onSelectAllVisible) },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onPick}
                className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2"
              >
                <item.icon className="h-4 w-4 text-ds-text-3" />
                {item.label}
              </button>
            ))}
          </Surface>
        </>
      )}
    </div>
  );
}
