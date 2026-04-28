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
  /** Si true, el campo se renderiza como una "caja" con borde y fondo card (estilo stats strip) */
  boxed?: boolean;
}

/**
 * DetailField — Campo label:valor estandarizado para vistas de detalle.
 *
 * Uso:
 * ```tsx
 * <DetailField label="RUT" value="76.123.456-7" mono />
 * <DetailField label="Estado" value={<StatusBadge status="active" />} />
 * <DetailField label="Notas" value={longText} fullWidth />
 * <DetailField label="Banco" value="BancoEstado" boxed />
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
  boxed = false,
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
        boxed &&
          "rounded-xl border border-border/60 bg-card/40 p-3 sm:p-4 transition-colors hover:bg-card/60 hover:border-border",
        className
      )}
    >
      <dt
        className={cn(
          "break-words",
          boxed
            ? "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80"
            : "text-xs font-medium text-muted-foreground mb-0.5 uppercase tracking-wide"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words",
          boxed ? "text-[13px] font-medium text-foreground" : "text-sm text-foreground",
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
  /** Si true, usa gap reducido apropiado para campos boxed */
  boxed?: boolean;
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
  boxed = false,
}: DetailFieldGridProps) {
  return (
    <dl
      className={cn(
        "grid min-w-0",
        boxed ? "gap-2 sm:gap-3" : "gap-x-6 gap-y-4",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {children}
    </dl>
  );
}
