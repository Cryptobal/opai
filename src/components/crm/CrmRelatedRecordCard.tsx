"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CRM_MODULES, type CrmModuleKey } from "./CrmModuleIcons";

/* ── Types ── */

interface CrmRelatedRecordCardProps {
  /** Módulo al que pertenece el registro (para icono y color) */
  module: CrmModuleKey;
  /** Texto principal (nombre del registro) */
  title: string;
  /** Subtítulo o dato secundario */
  subtitle?: string;
  /** Badge a mostrar (status, tipo, etc.). Si se pasa `color`, se usa en lugar de variant. */
  badge?: {
    label: string;
    variant?: "default" | "secondary" | "success" | "warning" | "destructive" | "outline";
    /** Color hex para la etapa del pipeline (ej: #94a3b8). Si se define, ignora variant. */
    color?: string;
  };
  /** Metadata adicional (ej: "3 contactos · 2 negocios") */
  meta?: string;
  /** URL de destino al hacer clic */
  href?: string;
  /** Slot derecho para acciones o contenido extra */
  actions?: React.ReactNode;
  /** Clases CSS adicionales */
  className?: string;
}

/**
 * CrmRelatedRecordCard — Card unificada para registros relacionados.
 *
 * Se usa idénticamente en todos los módulos CRM cuando se muestran
 * registros cruzados (ej: Contactos dentro de Cuentas, Negocios dentro de Contactos).
 *
 * Patrón visual:
 * ┌────────────────────────────────────────────────────┐
 * │  [Icono módulo]  Título            [Badge]   [→]   │
 * │                  Subtítulo · Meta                   │
 * └────────────────────────────────────────────────────┘
 */
export function CrmRelatedRecordCard({
  module,
  title,
  subtitle,
  badge,
  meta,
  href,
  actions,
  className,
}: CrmRelatedRecordCardProps) {
  const config = CRM_MODULES[module];
  const Icon = config.icon;

  const content = (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-all",
        href && "hover:border-border/80 hover:bg-accent/30 cursor-pointer",
        className
      )}
    >
      {/* Icono del módulo */}
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          config.color
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Contenido */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{title}</span>
          {badge && (
            badge.color ? (
              <span
                className="shrink-0 inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium"
                style={{
                  backgroundColor: `${badge.color}20`,
                  borderColor: badge.color,
                  color: badge.color,
                }}
              >
                {badge.label}
              </span>
            ) : (
              <Badge variant={badge.variant || "secondary"} className="shrink-0 text-[10px]">
                {badge.label}
              </Badge>
            )
          )}
        </div>
        {(subtitle || meta) && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {subtitle}
            {subtitle && meta && " · "}
            {meta}
          </p>
        )}
      </div>

      {/* Acciones o chevron */}
      {actions ? (
        <div className="shrink-0 flex items-center gap-1">{actions}</div>
      ) : href ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}

/* ── Grid de cards relacionadas ── */

interface CrmRelatedRecordGridProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * CrmRelatedRecordGrid — Grid para mostrar múltiples cards relacionadas.
 */
export function CrmRelatedRecordGrid({
  children,
  className,
}: CrmRelatedRecordGridProps) {
  return (
    <div className={cn("grid gap-2 sm:grid-cols-2", className)}>
      {children}
    </div>
  );
}
