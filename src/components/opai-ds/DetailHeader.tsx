"use client";

/**
 * OPAI DS v3 — DetailHeader
 *
 * Cabecera de una fila (~40px) para fichas de detalle, en desktop. Reemplaza
 * al PageHero con `backHref` de las detail pages:
 *
 *   ← Leads   ·   L-1042   Condominio San Antonio   [Activo]        [acciones]
 *
 * En móvil esta info vive en la isla contextual (modo detalle): el DetailHeader
 * se oculta `<lg`, pero igual publica el trailing (nombre de la entidad) para
 * que la isla y el `document.title` lo muestren. Opcionalmente publica también
 * la acción primaria a la isla (`islandAction`).
 */

import { type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSetBreadcrumbTrailing } from "./BreadcrumbTrailingContext";
import { useSetIslandAction, type IslandAction } from "./IslandActionContext";

export interface DetailHeaderProps {
  /** Nombre de la entidad (título). También se publica como trailing. */
  title: string;
  /** Destino del "volver" (listado padre). Si falta, usa router.back(). */
  backHref?: string;
  /** Texto del back link. Default: "Volver". */
  backLabel?: string;
  /** Identificador corto (folio, código), mono, antes del título. */
  code?: string;
  /** Estado (Tag/StatusDot) a la derecha del título. */
  status?: ReactNode;
  /** Acciones a la derecha (desktop). */
  actions?: ReactNode;
  /** Acción primaria a publicar en la isla móvil (opcional). */
  islandAction?: IslandAction;
  /** Publicar el título como trailing (isla + document.title). Default true. */
  publishTrailing?: boolean;
  className?: string;
}

export function DetailHeader({
  title,
  backHref,
  backLabel = "Volver",
  code,
  status,
  actions,
  islandAction,
  publishTrailing = true,
  className,
}: DetailHeaderProps) {
  const router = useRouter();
  useSetBreadcrumbTrailing(publishTrailing ? title : null);
  useSetIslandAction(islandAction);

  const backClasses =
    "inline-flex items-center gap-1 shrink-0 text-ds-body text-ds-text-3 transition-colors hover:text-ds-text-1";

  return (
    <div
      className={cn(
        // La isla cubre la ficha en móvil; el header es desktop-only.
        "hidden lg:flex items-center gap-3 min-w-0",
        className,
      )}
    >
      {backHref ? (
        <Link href={backHref} className={backClasses}>
          <ChevronLeft className="h-4 w-4" />
          <span>{backLabel}</span>
        </Link>
      ) : (
        <button type="button" onClick={() => router.back()} className={backClasses}>
          <ChevronLeft className="h-4 w-4" />
          <span>{backLabel}</span>
        </button>
      )}

      <span className="h-4 w-px shrink-0 bg-ds-border-subtle" aria-hidden />

      {code && (
        <span className="font-mono text-[12px] text-ds-text-3 shrink-0">{code}</span>
      )}

      <h1 className="min-w-0 truncate font-display text-lg font-semibold leading-tight text-ds-text-1">
        {title}
      </h1>

      {status && <div className="shrink-0">{status}</div>}

      {actions && (
        <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
