"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
        "sticky top-0 lg:top-[40px] z-10 -mx-4 -mt-6 mb-6 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80",
        "px-4 py-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:-mx-10 xl:px-10 2xl:-mx-12 2xl:px-12",
        className
      )}
    >
      {/* Volver — min 44px touch target */}
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 -ml-2 rounded-md p-2 min-h-[44px] sm:min-h-0 sm:p-0 sm:ml-0"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Volver a {resolvedBackLabel}</span>
      </Link>

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
