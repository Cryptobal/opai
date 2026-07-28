"use client";

/**
 * IslandModuleContext — contrato para que un módulo publique controles en la
 * isla móvil (Zona C'): menú de módulo, override de búsqueda y supresión
 * (p. ej. modo selección).
 *
 * Uso:
 *
 *   useSetIslandModuleMenu({
 *     icon: Menu,
 *     label: "Carpetas y filtros",
 *     badge: unread,
 *     onOpen: () => setDrawerOpen(true),
 *   });
 *   useSetIslandSearch({
 *     placeholder: "Buscá lo que recordás",
 *     value: query,
 *     onChange: setQuery,
 *     onExit: () => setQuery(""),
 *   });
 *   useSetIslandSuppressed(selectionMode);
 *
 * Handlers se proxyan por ref (mismo patrón que IslandActionContext) para no
 * re-correr efectos por identidad de función.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";

export interface IslandModuleMenu {
  icon: LucideIcon;
  label: string;
  badge?: number;
  onOpen: () => void;
}

export interface IslandSearch {
  placeholder: string;
  value: string;
  onChange: (q: string) => void;
  onExit?: () => void;
}

interface IslandModuleState {
  moduleMenu: IslandModuleMenu | null;
  search: IslandSearch | null;
  suppressed: boolean;
  setModuleMenu: (m: IslandModuleMenu | null) => void;
  setSearch: (s: IslandSearch | null) => void;
  setSuppressed: (v: boolean) => void;
}

const Ctx = createContext<IslandModuleState | null>(null);

export function IslandModuleProvider({ children }: { children: ReactNode }) {
  const [moduleMenu, setModuleMenu] = useState<IslandModuleMenu | null>(null);
  const [search, setSearch] = useState<IslandSearch | null>(null);
  const [suppressed, setSuppressed] = useState(false);
  const value = useMemo(
    () => ({
      moduleMenu,
      search,
      suppressed,
      setModuleMenu,
      setSearch,
      setSuppressed,
    }),
    [moduleMenu, search, suppressed],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Lectura completa del contrato (para la isla). */
export function useIslandModule(): {
  moduleMenu: IslandModuleMenu | null;
  search: IslandSearch | null;
  suppressed: boolean;
} {
  const ctx = useContext(Ctx);
  return {
    moduleMenu: ctx?.moduleMenu ?? null,
    search: ctx?.search ?? null,
    suppressed: ctx?.suppressed ?? false,
  };
}

/** Publica el botón de menú de módulo (Zona C'). */
export function useSetIslandModuleMenu(
  menu: IslandModuleMenu | null | undefined,
) {
  const ctx = useContext(Ctx);
  const setModuleMenu = ctx?.setModuleMenu;
  const label = menu?.label ?? null;
  const icon = menu?.icon ?? null;
  const badge = menu?.badge ?? 0;
  const onOpenRef = useRef(menu?.onOpen);
  onOpenRef.current = menu?.onOpen;

  useEffect(() => {
    if (!setModuleMenu) return;
    if (!label || !icon) {
      setModuleMenu(null);
      return;
    }
    setModuleMenu({
      label,
      icon,
      badge: badge > 0 ? badge : undefined,
      onOpen: () => onOpenRef.current?.(),
    });
    return () => setModuleMenu(null);
  }, [setModuleMenu, label, icon, badge]);
}

/** Publica el override de búsqueda de la isla. */
export function useSetIslandSearch(search: IslandSearch | null | undefined) {
  const ctx = useContext(Ctx);
  const setSearch = ctx?.setSearch;
  const placeholder = search?.placeholder ?? null;
  const value = search?.value ?? "";
  const onChangeRef = useRef(search?.onChange);
  const onExitRef = useRef(search?.onExit);
  onChangeRef.current = search?.onChange;
  onExitRef.current = search?.onExit;

  // Publicar / limpiar solo al montar o cambiar placeholder (no en cada tecla).
  useEffect(() => {
    if (!setSearch) return;
    if (!placeholder) {
      setSearch(null);
      return;
    }
    setSearch({
      placeholder,
      value,
      onChange: (q: string) => onChangeRef.current?.(q),
      onExit: () => onExitRef.current?.(),
    });
    return () => setSearch(null);
    // value se sincroniza en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSearch, placeholder]);

  // Sincronizar value sin teardown (input controlado en la isla).
  useEffect(() => {
    if (!setSearch || !placeholder) return;
    setSearch({
      placeholder,
      value,
      onChange: (q: string) => onChangeRef.current?.(q),
      onExit: () => onExitRef.current?.(),
    });
  }, [setSearch, placeholder, value]);
}

/** Suprime el montaje de la isla (p. ej. modo selección). */
export function useSetIslandSuppressed(suppressed: boolean) {
  const ctx = useContext(Ctx);
  const setSuppressed = ctx?.setSuppressed;
  useEffect(() => {
    if (!setSuppressed) return;
    setSuppressed(suppressed);
    return () => setSuppressed(false);
  }, [setSuppressed, suppressed]);
}

/** Evento para abrir el modo búsqueda de la isla desde atajos de teclado. */
export const ISLAND_OPEN_SEARCH_EVENT = "opai:island-open-search";

export function requestIslandSearchOpen() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ISLAND_OPEN_SEARCH_EVENT));
}

/** Hook interno: registra el opener (usado por MobileIsland). */
export function useIslandSearchOpenListener(onOpen: () => void) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const stable = useCallback(() => onOpenRef.current(), []);
  useEffect(() => {
    const handler = () => stable();
    window.addEventListener(ISLAND_OPEN_SEARCH_EVENT, handler);
    return () => window.removeEventListener(ISLAND_OPEN_SEARCH_EVENT, handler);
  }, [stable]);
}
