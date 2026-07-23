"use client";

import { Menu, Search, Sparkles } from "lucide-react";

type Props = {
  /** Abre el drawer lateral del módulo (carpetas + filtros + acciones). */
  onOpenNav: () => void;
  query: string;
  onQuery: (q: string) => void;
  semantic: boolean;
  onSemantic: (v: boolean) => void;
  /** No leídos de Recibidos: badge rojo sobre el menú (tres líneas). */
  inboxUnread: number;
};

/**
 * Top móvil tipo Gmail (Opción C): píldora de búsqueda (menú + input + IA).
 * Es lo único sticky del módulo en móvil; desktop conserva el riel intacto.
 * El estado "En vivo" y "Sincronizar" viven en el drawer (tres líneas); acá el
 * único indicador es el badge rojo de no leídos sobre el menú.
 */
export function CorreosMobileTopBar({
  onOpenNav,
  query,
  onQuery,
  semantic,
  onSemantic,
  inboxUnread,
}: Props) {
  const unreadLabel = inboxUnread > 99 ? "99+" : String(inboxUnread);

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
            aria-label={
              inboxUnread > 0
                ? `Abrir carpetas y filtros — ${inboxUnread} sin leer`
                : "Abrir carpetas y filtros"
            }
            className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ds-text-2 ds-tap"
          >
            <Menu className="h-5 w-5" />
            {inboxUnread > 0 && (
              <span
                aria-hidden
                className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-danger px-1 text-[12px] font-semibold leading-none text-white shadow-ds-xs"
              >
                {unreadLabel}
              </span>
            )}
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
    </div>
  );
}
