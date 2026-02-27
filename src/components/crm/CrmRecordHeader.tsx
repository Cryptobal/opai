"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CRM_MODULES, type CrmModuleKey } from "./CrmModuleIcons";
import { RecordActions, type RecordAction } from "./RecordActions";
import type { ReactNode } from "react";

/* ── Types ── */

export interface CrmRecordHeaderProps {
  /** Módulo CRM (para icono y color) */
  module: CrmModuleKey;
  /** Nombre/título del registro */
  title: string;
  /** Subtítulo (RUT, cargo, etapa, etc.) */
  subtitle?: string;
  /** Badge de estado */
  badge?: {
    label: string;
    variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
  };
  /** Breadcrumb simplificado: link de "Volver" */
  backHref: string;
  backLabel?: string;
  /** Acciones del registro (editar, eliminar, etc.) */
  actions?: RecordAction[];
  /** Slot para contenido custom a la derecha (ej: toggle activo/inactivo) */
  extra?: ReactNode;
  /** Clases CSS adicionales */
  className?: string;
}

/**
 * CrmRecordHeader — Header sticky para páginas de detalle CRM.
 *
 * Patrón visual (estilo HubSpot/Salesforce):
 * ┌──────────────────────────────────────────────────────────────┐
 * │  ← Volver a Cuentas                                         │
 * │  [Icono]  Nombre del Registro  [Badge Estado]    [Editar][⋮]│
 * │           Subtítulo secundario                               │
 * └──────────────────────────────────────────────────────────────┘
 */
export function CrmRecordHeader({
  module,
  title,
  subtitle,
  badge,
  backHref,
  backLabel,
  actions,
  extra,
  className,
}: CrmRecordHeaderProps) {
  const config = CRM_MODULES[module];
  const Icon = config.icon;
  const resolvedBackLabel = backLabel || config.labelPlural;

  return (
    <div
      className={cn(
        "sticky top-0 lg:top-12 z-10 mb-4 sm:mb-5 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "-mx-2 px-4 py-4 sm:-mx-3 sm:px-6",
        "lg:-ml-2 lg:-mr-8 lg:pl-4 lg:pr-8",
        "xl:-ml-3 xl:-mr-10 xl:pl-6 xl:pr-10",
        "2xl:-ml-4 2xl:-mr-12 2xl:pl-6 2xl:pr-12",
        className
      )}
    >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-3 -ml-1 sm:ml-0">
        <ol className="flex items-center gap-1 text-xs text-muted-foreground">
          <li>
            <Link href="/crm" className="hover:text-foreground transition-colors rounded px-1 py-0.5 min-h-[44px] sm:min-h-0 inline-flex items-center">
              CRM
            </Link>
          </li>
          <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
          <li>
            <Link href={backHref} className="hover:text-foreground transition-colors rounded px-1 py-0.5 inline-flex items-center">
              {resolvedBackLabel}
            </Link>
          </li>
          <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
          <li className="text-foreground font-medium truncate max-w-[200px]" aria-current="page">{title}</li>
        </ol>
      </nav>

      {/* Título + acciones */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {/* Icono del módulo */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
              config.color
            )}
          >
            <Icon className="h-5 w-5" />
          </div>

          {/* Info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-semibold tracking-tight truncate">
                {title}
              </h1>
              {badge && (
                <Badge variant={badge.variant || "secondary"} className="shrink-0">
                  <span className="inline-flex h-1.5 w-1.5 rounded-full bg-current mr-1" />
                  {badge.label}
                </Badge>
              )}
            </div>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          {extra}
          {actions && actions.length > 0 && <RecordActions actions={actions} />}
        </div>
      </div>
    </div>
  );
}
