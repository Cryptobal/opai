"use client";

/**
 * IslandModuleContext — contrato para que un módulo publique controles en la
 * isla móvil (Zona C') y en el topbar desktop (lupa → overlay de búsqueda):
 * menú de módulo, override de búsqueda (con operadores) y supresión
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
 *     operators: [{ token: "from:", hint: "remitente" }],
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

export interface ModuleSearchOperator {
  /** Token insertable, p. ej. "from:". */
  token: string;
  /** Ayuda corta en español, p. ej. "remitente". */
  hint?: string;
}

export interface IslandSearch {
  placeholder: string;
  value: string;
  onChange: (q: string) => void;
  onExit?: () => void;
  /** Enter en el campo: confirmar búsqueda (p. ej. rama semántica). */
  onSubmit?: () => void;
  /** Fetch de búsqueda en vuelo — indicador sutil en el campo. */
  pending?: boolean;
  /** Operadores ofrecidos por el módulo (topbar desktop). */
  operators?: ModuleSearchOperator[];
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

/** Lectura completa del contrato (isla móvil + topbar desktop). */
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

/** Alias neutral respecto de plataforma (isla / topbar). */
export const useModuleSurface = useIslandModule;

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

/** Publica el override de búsqueda (isla móvil + topbar desktop). */
export function useSetIslandSearch(search: IslandSearch | null | undefined) {
  const ctx = useContext(Ctx);
  const setSearch = ctx?.setSearch;
  const placeholder = search?.placeholder ?? null;
  const value = search?.value ?? "";
  const pending = Boolean(search?.pending);
  const operatorsKey =
    search?.operators?.map((o) => `${o.token}|${o.hint ?? ""}`).join(",") ?? "";
  const operators = search?.operators;
  const onChangeRef = useRef(search?.onChange);
  const onExitRef = useRef(search?.onExit);
  const onSubmitRef = useRef(search?.onSubmit);
  const operatorsRef = useRef(operators);
  onChangeRef.current = search?.onChange;
  onExitRef.current = search?.onExit;
  onSubmitRef.current = search?.onSubmit;
  operatorsRef.current = operators;

  // Publicar / limpiar solo al montar o cambiar placeholder/operators.
  useEffect(() => {
    if (!setSearch) return;
    if (!placeholder) {
      setSearch(null);
      return;
    }
    setSearch({
      placeholder,
      value,
      pending,
      onChange: (q: string) => onChangeRef.current?.(q),
      onExit: () => onExitRef.current?.(),
      onSubmit: () => onSubmitRef.current?.(),
      operators: operatorsRef.current,
    });
    return () => setSearch(null);
    // value/pending se sincronizan en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSearch, placeholder, operatorsKey]);

  // Sincronizar value/pending sin teardown (input controlado en isla/overlay).
  useEffect(() => {
    if (!setSearch || !placeholder) return;
    setSearch({
      placeholder,
      value,
      pending,
      onChange: (q: string) => onChangeRef.current?.(q),
      onExit: () => onExitRef.current?.(),
      onSubmit: () => onSubmitRef.current?.(),
      operators: operatorsRef.current,
    });
  }, [setSearch, placeholder, value, pending, operatorsKey]);
}

/** Alias neutral respecto de plataforma. */
export const useSetModuleSearch = useSetIslandSearch;

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

/** Evento para abrir el modo búsqueda (isla móvil o overlay desktop). */
export const ISLAND_OPEN_SEARCH_EVENT = "opai:island-open-search";

export function requestIslandSearchOpen() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ISLAND_OPEN_SEARCH_EVENT));
}

/** Hook interno: registra el opener (usado por MobileIsland y TopbarActions). */
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
