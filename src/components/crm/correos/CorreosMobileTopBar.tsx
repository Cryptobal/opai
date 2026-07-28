"use client";

import { Menu, Search, X } from "lucide-react";
import { SurfaceSegment } from "@/components/opai/SurfaceSegment";
import { useClientSurface } from "@/hooks/useClientSurface";

type Props = {
  /** Abre el drawer lateral del módulo (carpetas + filtros + acciones). */
  onOpenNav: () => void;
  query: string;
  onQuery: (q: string) => void;
  /** No leídos de Recibidos: badge rojo sobre el menú (tres líneas). */
  inboxUnread: number;
};

/**
 * Top móvil tipo Gmail: misma isla Liquid Glass que el resto del ERP, con el
 * SurfaceSegment a la izquierda (Correos es inmersivo y no monta MobileIsland).
 */
export function CorreosMobileTopBar({
  onOpenNav,
  query,
  onQuery,
  inboxUnread,
}: Props) {
  const surface = useClientSurface();
  const unreadLabel = inboxUnread > 99 ? "99+" : String(inboxUnread);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-30 lg:hidden"
      style={{
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="px-3 pt-2">
        <div className="pointer-events-auto opai-glass-strong flex min-h-12 min-w-0 items-center gap-1 rounded-[22px] pl-1.5 pr-1.5">
          <SurfaceSegment surface={surface} variant="compact" className="shrink-0" />
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
          <Search aria-hidden className="mx-0.5 h-4 w-4 shrink-0 text-ds-text-4" />
          <input
            id="correos-search-input-mobile"
            className="h-11 min-w-0 flex-1 appearance-none border-0 bg-transparent text-[15px] text-ds-text-1 shadow-none outline-none ring-0 placeholder:text-ds-text-4 focus:ring-0"
            placeholder="Buscá lo que recordás"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Limpiar búsqueda"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ds-text-3 ds-tap"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
