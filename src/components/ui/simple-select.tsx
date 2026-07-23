"use client";

/**
 * SimpleSelect — wrapper del `Select` del DS (Radix) con API estilo `<select>`
 * nativo, para migrar los selects HTML crudos sin boilerplate y sin la ruleta
 * nativa del sistema operativo en mobile.
 *
 * Diferencias clave que resuelve respecto a Radix crudo:
 *  - Radix NO permite `SelectItem value=""` (reserva "" para limpiar). Los
 *    `<select>` nativos usan `<option value="">Todos</option>` a cada rato.
 *    SimpleSelect mapea "" ↔ un sentinel interno, así es un drop-in real.
 *  - Acepta `options` (caso simple) o `children` (grupos/casos complejos).
 *  - Hereda el material Liquid Glass del trigger del DS en mobile.
 *
 * Los valores son SIEMPRE string (igual que el DOM). Para selects numéricos:
 *   value={String(n)}  onValueChange={(v) => setN(Number(v))}
 */

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface SimpleSelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

// Radix reserva value="" → sentinel interno para soportar la opción vacía.
const EMPTY_SENTINEL = "__simple_select_empty__";
const toInner = (v: string) => (v === "" ? EMPTY_SENTINEL : v);
const fromInner = (v: string) => (v === EMPTY_SENTINEL ? "" : v);

export interface SimpleSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Opciones simples. Alternativa a `children` (SelectItem/SelectGroup). */
  options?: SimpleSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** className del trigger. */
  className?: string;
  /** className del panel (SelectContent). */
  contentClassName?: string;
  id?: string;
  name?: string;
  title?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  children?: React.ReactNode;
}

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
  contentClassName,
  id,
  name,
  title,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  children,
}: SimpleSelectProps) {
  return (
    <Select
      value={toInner(value)}
      onValueChange={(v) => onValueChange(fromInner(v))}
      disabled={disabled}
      name={name}
    >
      <SelectTrigger
        id={id}
        title={title}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        className={className}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options
          ? options.map((opt) => (
              <SelectItem
                key={opt.value}
                value={toInner(opt.value)}
                disabled={opt.disabled}
              >
                {opt.label}
              </SelectItem>
            ))
          : children}
      </SelectContent>
    </Select>
  );
}

/**
 * Item para usar con `children` cuando se necesitan grupos o labels. Re-export
 * conveniente para no importar de dos módulos. El value "" se mapea al sentinel.
 */
export function SimpleSelectItem({
  value,
  disabled,
  children,
}: {
  value: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <SelectItem value={toInner(value)} disabled={disabled}>
      {children}
    </SelectItem>
  );
}
