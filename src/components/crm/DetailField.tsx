"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ── Types ── */

interface DetailFieldProps {
  /** Label del campo (ej: "RUT", "Industria") */
  label: string;
  /** Valor del campo — string, number, o ReactNode para badges/links */
  value?: ReactNode;
  /** Icono opcional a la izquierda del valor */
  icon?: ReactNode;
  /** Si true, ocupa 2 columnas en un grid */
  fullWidth?: boolean;
  /** Texto a mostrar cuando value es null/undefined/vacío */
  placeholder?: string;
  /** Clases CSS adicionales */
  className?: string;
  /** Si true, el valor se muestra como texto mono (ej: RUT, teléfono) */
  mono?: boolean;
  /** Si true, copia al portapapeles al hacer clic */
  copyable?: boolean;
}

/**
 * DetailField — Campo label:valor estandarizado para vistas de detalle CRM.
 *
 * Uso:
 * ```tsx
 * <DetailField label="RUT" value="76.123.456-7" mono />
 * <DetailField label="Estado" value={<StatusBadge status="active" />} />
 * <DetailField label="Notas" value={longText} fullWidth />
 * ```
 */
export function DetailField({
  label,
  value,
  icon,
  fullWidth = false,
  placeholder = "—",
  className,
  mono = false,
  copyable = false,
}: DetailFieldProps) {
  const isEmpty =
    value === null || value === undefined || value === "" || value === 0;

  const handleCopy = () => {
    if (!copyable || isEmpty || typeof value !== "string") return;
    navigator.clipboard.writeText(value).catch(() => {});
  };

  return (
    <div
      className={cn(
        "min-w-0",
        fullWidth && "sm:col-span-2",
        className
      )}
    >
      <dt className="text-xs font-medium text-muted-foreground mb-0.5 uppercase tracking-wide break-words">
        {label}
      </dt>
      <dd
        className={cn(
          "text-sm text-foreground min-w-0 break-words",
          mono && "font-mono tabular-nums",
          copyable && !isEmpty && "cursor-copy hover:text-primary transition-colors",
          isEmpty && "text-muted-foreground/60"
        )}
        onClick={copyable ? handleCopy : undefined}
        title={copyable && typeof value === "string" ? "Clic para copiar" : undefined}
      >
        <span className="flex items-start gap-1.5 min-w-0">
          {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
          <span className="min-w-0 break-words">
            {isEmpty ? placeholder : value}
          </span>
        </span>
      </dd>
    </div>
  );
}

/* ── DetailFieldGrid ── */

interface DetailFieldGridProps {
  children: ReactNode;
  className?: string;
  /** Número de columnas: 2 (default) o 3 */
  columns?: 2 | 3;
}

/**
 * DetailFieldGrid — Grid wrapper para DetailField.
 *
 * Uso:
 * ```tsx
 * <DetailFieldGrid>
 *   <DetailField label="Nombre" value="ACME" />
 *   <DetailField label="RUT" value="76.123.456-7" />
 * </DetailFieldGrid>
 * ```
 */
export function DetailFieldGrid({
  children,
  className,
  columns = 2,
}: DetailFieldGridProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4 min-w-0",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {children}
    </dl>
  );
}
