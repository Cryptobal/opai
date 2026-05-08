"use client";

/**
 * BreadcrumbTrailingContext — bridge para que detail pages publiquen
 * el nombre de la entidad (ej: "Condominio San Antonio 510/540") y el
 * `<AutoBreadcrumbs />` global montado en `AppShell` lo use como último
 * segmento del breadcrumb.
 *
 * Uso en una detail page:
 *
 *   "use client";
 *   import { useSetBreadcrumbTrailing } from "@/components/opai-ds";
 *
 *   export function CrmLeadDetailClient({ lead }) {
 *     useSetBreadcrumbTrailing(lead.name);
 *     return <EntityDetailLayout ... />;
 *   }
 *
 * Resultado: el breadcrumb arriba muestra "Comercial › Leads › <Nombre>"
 * en vez de "Comercial › Leads".
 *
 * El hook se limpia automáticamente al desmontar — al navegar a otra
 * página, el trailing se resetea para que AutoBreadcrumbs vuelva a
 * derivar del path puro.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

interface BreadcrumbTrailingState {
  trailing: string | null;
  setTrailing: (value: string | null) => void;
}

const Ctx = createContext<BreadcrumbTrailingState | null>(null);

export function BreadcrumbTrailingProvider({ children }: { children: ReactNode }) {
  const [trailing, setTrailing] = useState<string | null>(null);
  const value = useMemo(() => ({ trailing, setTrailing }), [trailing]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBreadcrumbTrailing(): string | null {
  return useContext(Ctx)?.trailing ?? null;
}

/**
 * Publica el nombre de la entidad como último segmento del breadcrumb.
 * Pasá `null` o un string vacío para no agregar nada (default behaviour).
 */
export function useSetBreadcrumbTrailing(value: string | null | undefined) {
  const ctx = useContext(Ctx);
  useEffect(() => {
    if (!ctx) return;
    const v = value && value.length > 0 ? value : null;
    ctx.setTrailing(v);
    return () => {
      // Reset on unmount/path change so siblings without a trailing
      // don't inherit a stale name.
      ctx.setTrailing(null);
    };
  }, [ctx, value]);
}

/**
 * Componente cliente conveniente para usar desde Server Components
 * (donde no podés llamar hooks directamente). Renderiza nada visible.
 *
 *   export default async function Page() {
 *     const rendicion = await loadRendicion();
 *     return (
 *       <>
 *         <SetBreadcrumbTrailing value={rendicion.code} />
 *         <PageHero ... />
 *       </>
 *     );
 *   }
 */
export function SetBreadcrumbTrailing({ value }: { value: string | null | undefined }) {
  useSetBreadcrumbTrailing(value);
  return null;
}
