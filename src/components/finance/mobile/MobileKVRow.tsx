"use client";

/**
 * MobileKVRow — fila key/value para sustituir `<table>` chicas en
 * modales/details cuando se renderizan en celular.
 *
 * Patrón: label izq con text-ds-text-3, valor der con tabular-nums
 * cuando es numérico. El consumidor controla el formateo del valor.
 *
 * También exporta `MobileKVList` que envuelve un grupo de KVRows con
 * separador horizontal y border-bottom único.
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface RowProps {
  label: ReactNode;
  value: ReactNode;
  /** Si true, fuerza el valor a font-mono tabular-nums (CLP, %). */
  mono?: boolean;
  /** Tono del valor. */
  tone?: "default" | "ok" | "warn" | "danger" | "muted";
  className?: string;
  /** Si presente, la fila completa es clickeable. */
  onClick?: () => void;
}

export function MobileKVRow({
  label,
  value,
  mono = false,
  tone = "default",
  className,
  onClick,
}: RowProps) {
  const toneCls =
    tone === "ok"
      ? "text-status-ok-fg"
      : tone === "warn"
        ? "text-status-warn-fg"
        : tone === "danger"
          ? "text-status-danger-fg"
          : tone === "muted"
            ? "text-ds-text-3"
            : "text-ds-text-1";
  const valueClass = cn(
    "text-[13px] font-medium text-right shrink-0",
    mono && "font-mono tabular-nums",
    toneCls,
  );
  const inner = (
    <>
      <span className="text-[12px] text-ds-text-3 min-w-0 flex-1">
        {label}
      </span>
      <span className={valueClass}>{value}</span>
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "w-full flex items-center justify-between gap-3 py-2 min-h-[40px] text-left active:bg-muted/30",
          className,
        )}
      >
        {inner}
      </button>
    );
  }
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 py-2 min-h-[36px]",
        className,
      )}
    >
      {inner}
    </div>
  );
}

interface ListProps {
  children: ReactNode;
  className?: string;
  /** Si true, agrega border + rounded en el contenedor. */
  bordered?: boolean;
}

export function MobileKVList({
  children,
  className,
  bordered = false,
}: ListProps) {
  return (
    <div
      className={cn(
        "divide-y divide-border/60",
        bordered && "rounded-ds-md border border-border bg-ds-surface-1 px-3",
        className,
      )}
    >
      {children}
    </div>
  );
}
