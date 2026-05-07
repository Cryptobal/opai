"use client";

/**
 * PageShell — Wrapper estándar de toda página de la app.
 *
 * Compone, en orden fijo:
 *   1. <AutoBreadcrumbs />
 *   2. <ModuleSubNav />          (oculto por default; layouts ya montan el N3)
 *   3. <PageHero> (opcional)
 *   4. children
 *
 * Patrón de uso:
 *
 *   export default async function MiPagina() {
 *     return (
 *       <PageShell
 *         hero={{
 *           icon: <FileText />,
 *           iconTone: "teal",
 *           title: "Facturación electrónica",
 *           subtitle: "DTE Chile",
 *           description: "Emisión y gestión de DTE.",
 *           actions: <Button>+ Emitir DTE</Button>,
 *         }}
 *         trailingBreadcrumb="Polpaico S.A."  // opcional, para detail pages
 *       >
 *         <Contenido />
 *       </PageShell>
 *     );
 *   }
 *
 * Convención: los layouts de cada módulo ya montan `<ModuleSubNav>`. Por
 * eso PageShell oculta el subnav por default (`subnavVisibility="hidden"`).
 * Páginas que NO viven bajo un layout con N3 pueden pasar
 * `subnavVisibility="desktop-only"`.
 *
 * Nota para Server Components: `icon` debe pasarse como ReactElement
 * (`<FileText />`) — los lucide icons son `forwardRef` y rompen la
 * serialización RSC si se pasan como referencia.
 *
 * Escape hatch: si una página NO necesita breadcrumb/N3/hero (ej. /chat,
 * /hub, /fiscalizacion), NO usar PageShell.
 */

import { ReactNode } from "react";
import { AutoBreadcrumbs } from "./AutoBreadcrumbs";
import { ModuleSubNav } from "./ModuleSubNav";
import { PageHero, type PageHeroProps } from "./PageHero";
import { cn } from "@/lib/utils";

export interface PageShellProps {
  /** Configuración del PageHero. Si no se pasa, no se renderiza hero. */
  hero?: Omit<PageHeroProps, "className">;
  /** Override del último segmento del breadcrumb (útil en detail pages). */
  trailingBreadcrumb?: string;
  /** Forzar un módulo específico para el N3 (auto-detect por default). */
  subnavModuleKey?: string;
  /** Trailing action del SubNav (botón al final de los pills). */
  subnavTrailingAction?: ReactNode;
  /** Visibilidad del SubNav. Default: "hidden" — los layouts ya lo montan. */
  subnavVisibility?: "desktop-only" | "always" | "hidden";
  /** Clase del wrapper externo. */
  className?: string;
  /** Espaciado vertical entre breadcrumb/hero/contenido. Default: "default". */
  contentSpacing?: "default" | "tight" | "relaxed";
  children?: ReactNode;
}

export function PageShell({
  hero,
  trailingBreadcrumb,
  subnavModuleKey,
  subnavTrailingAction,
  subnavVisibility = "hidden",
  className,
  contentSpacing = "default",
  children,
}: PageShellProps) {
  const spacing =
    contentSpacing === "tight"
      ? "space-y-3"
      : contentSpacing === "relaxed"
      ? "space-y-8"
      : "space-y-6";

  return (
    <div className={cn("min-w-0", spacing, className)}>
      {/* ① Breadcrumbs */}
      <AutoBreadcrumbs trailing={trailingBreadcrumb} />

      {/* ② SubNav N3 — oculto por default; layouts montan el N3 */}
      {subnavVisibility !== "hidden" && (
        <ModuleSubNav
          moduleKey={subnavModuleKey}
          visibility={subnavVisibility === "always" ? "always" : "desktop-only"}
          trailingAction={subnavTrailingAction}
        />
      )}

      {/* ③ Hero */}
      {hero && <PageHero {...hero} />}

      {/* ④ Contenido */}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
