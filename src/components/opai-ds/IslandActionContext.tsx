"use client";

/**
 * IslandActionContext — puente para que una página publique su acción primaria
 * a la isla contextual móvil (modo detalle). Análogo a
 * BreadcrumbTrailingContext pero para el botón de acción a la derecha de la
 * isla.
 *
 * Uso en una ficha (client component):
 *
 *   useSetIslandAction({ icon: Send, label: "Enviar", href: `/crm/cotizaciones/${id}/enviar` });
 *
 * La isla (AppShell) lee la acción con `useIslandAction()` y la renderiza a la
 * derecha en modo detalle. Al desmontar/navegar, la acción se limpia.
 *
 * `onClick` se proxya por ref para que el efecto no re-corra en cada render
 * (evita loops si el consumidor pasa un handler nuevo cada vez); label/href/
 * icon son la clave de identidad — para actualizar el handler basta con que
 * uno de ellos cambie, o pasar un `onClick` estable (useCallback).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { LucideIcon } from "lucide-react";

export interface IslandAction {
  /** Ícono Lucide opcional. */
  icon?: LucideIcon;
  /** Etiqueta accesible / texto del botón. */
  label: string;
  /** Navegación (Link). Tiene prioridad sobre onClick si ambos existen. */
  href?: string;
  /** Handler alternativo cuando no es una navegación. */
  onClick?: () => void;
}

interface IslandActionState {
  action: IslandAction | null;
  setAction: (a: IslandAction | null) => void;
}

const Ctx = createContext<IslandActionState | null>(null);

export function IslandActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<IslandAction | null>(null);
  const value = useMemo(() => ({ action, setAction }), [action]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Lee la acción publicada (para la isla). */
export function useIslandAction(): IslandAction | null {
  return useContext(Ctx)?.action ?? null;
}

/** Publica la acción primaria de la página en la isla móvil. */
export function useSetIslandAction(action: IslandAction | null | undefined) {
  const ctx = useContext(Ctx);
  const label = action?.label ?? null;
  const href = action?.href ?? null;
  const icon = action?.icon ?? null;
  const onClickRef = useRef(action?.onClick);
  onClickRef.current = action?.onClick;

  useEffect(() => {
    if (!ctx) return;
    if (!label) {
      ctx.setAction(null);
      return;
    }
    ctx.setAction({
      label,
      href: href ?? undefined,
      icon: icon ?? undefined,
      onClick: onClickRef.current ? () => onClickRef.current?.() : undefined,
    });
    return () => ctx.setAction(null);
  }, [ctx, label, href, icon]);
}
