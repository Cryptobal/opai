"use client";

import { Menu, Search, Sparkles, Wifi, WifiOff } from "lucide-react";
import type { CorreosRealtimeStatus } from "./useCorreosRealtime";
import { TABS, type CorreoFolderTab } from "./CorreosFilters";

type Props = {
  /** Abre el drawer lateral del módulo (carpetas + filtros + acciones). */
  onOpenNav: () => void;
  query: string;
  onQuery: (q: string) => void;
  semantic: boolean;
  onSemantic: (v: boolean) => void;
  folder: CorreoFolderTab;
  inboxUnread: number;
  realtimeStatus: CorreosRealtimeStatus;
  lastSyncAt: string | null;
};

/**
 * Top móvil tipo Gmail (Opción C): píldora de búsqueda (menú + input + IA)
 * con una línea de contexto de carpeta debajo. Es lo único sticky del módulo
 * en móvil; desktop conserva CorreosFilters intacto.
 */
export function CorreosMobileTopBar({
  onOpenNav,
  query,
  onQuery,
  semantic,
  onSemantic,
  folder,
  inboxUnread,
  realtimeStatus,
  lastSyncAt,
}: Props) {
  const folderLabel = TABS.find((t) => t.key === folder)?.label ?? "Correos";
  const lastSyncLabel = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString("es-CL", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const live = realtimeStatus === "live";

  return (
    <div className="pointer-events-none sticky top-[env(safe-area-inset-top,0px)] z-20 lg:hidden">
      {/* Tapa la franja del notch cuando la barra queda pegada arriba. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-full h-[env(safe-area-inset-top,0px)] bg-background"
      />
      {/* Isla flotante Liquid Glass (misma familia que la isla del AppShell):
          la lista se desliza por debajo, nada de barras cuadradas. */}
      <div className="px-3 pt-2">
        <div className="pointer-events-auto opai-glass-strong flex min-h-12 min-w-0 items-center rounded-[22px] pl-1 pr-1.5">
          <button
            type="button"
            onClick={onOpenNav}
            aria-label="Abrir carpetas y filtros"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ds-text-2 ds-tap"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Search aria-hidden className="mx-1 h-4 w-4 shrink-0 text-ds-text-4" />
          <input
            id="correos-search-input-mobile"
            className="h-11 min-w-0 flex-1 appearance-none border-0 bg-transparent text-[15px] text-ds-text-1 shadow-none outline-none ring-0 placeholder:text-ds-text-4 focus:ring-0"
            placeholder="Buscar en el correo"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          <button
            type="button"
            onClick={() => onSemantic(!semantic)}
            aria-pressed={semantic}
            title="Buscar por significado (búsqueda semántica con IA)"
            className={`ml-1 inline-flex h-9 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] ds-tap ${
              semantic ? "bg-primary text-primary-foreground" : "text-ds-text-3"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> IA
          </button>
        </div>
      </div>
      <div className="pointer-events-auto mx-3 mb-1 mt-1.5 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full opai-glass-pill px-3 py-1 text-[12px] text-ds-text-3">
        <span className="truncate font-medium text-ds-text-2">{folderLabel}</span>
        {folder === "inbox" && inboxUnread > 0 && (
          <>
            <span aria-hidden>·</span>
            <span className="shrink-0">{inboxUnread} sin leer</span>
          </>
        )}
        <span aria-hidden>·</span>
        <span
          className={`inline-flex min-w-0 items-center gap-1 ${live ? "text-status-ok-fg" : ""}`}
          aria-live="polite"
          title={
            live
              ? "Los cambios de Gmail llegan en tiempo real"
              : "Reconectando; la bandeja se actualiza automáticamente"
          }
        >
          {live ? (
            <Wifi className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="truncate">
            {live
              ? "En vivo"
              : lastSyncLabel
                ? `Actualizado ${lastSyncLabel}`
                : "Reconectando"}
          </span>
        </span>
      </div>
    </div>
  );
}
