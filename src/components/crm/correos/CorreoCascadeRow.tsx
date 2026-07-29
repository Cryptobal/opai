"use client";

import { ArrowUpRight, Plus, type LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string | null;
  depth: number;
  /** Hay valor → navegar; sin valor y editable → abrir omnibox. */
  hasValue: boolean;
  editable?: boolean;
  disabled?: boolean;
  href?: string | null;
  onAdd?: () => void;
  /** Acción secundaria (p. ej. expandir contactos). */
  onActivate?: () => void;
};

/**
 * Fila de la cascada editable (Copiloto v4).
 * Con valor: ↗ navega a la ficha. Sin valor: ＋ abre el buscador in situ.
 */
export function CorreoCascadeRow({
  icon: Icon,
  label,
  value,
  depth,
  hasValue,
  editable = false,
  disabled = false,
  href,
  onAdd,
  onActivate,
}: Props) {
  const showAdd = !hasValue && editable && !disabled;
  const canNavigate = hasValue && Boolean(href);

  function handleClick() {
    if (disabled) return;
    if (showAdd) {
      onAdd?.();
      return;
    }
    if (onActivate) {
      onActivate();
      return;
    }
    if (canNavigate && href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || (!showAdd && !canNavigate && !onActivate)}
      className="relative flex min-h-11 w-full items-center gap-2.5 py-2 text-left ds-tap hover:bg-ds-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: 12 }}
    >
      {depth > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0 border-l-2 border-primary/30"
          style={{ left: `${12 + (depth - 1) * 16 + 7}px` }}
        />
      )}
      <Icon className="relative h-4 w-4 shrink-0 text-ds-text-3" />
      <span className="relative text-[13px] font-medium text-ds-text-1">{label}</span>
      <span
        className={`relative ml-auto truncate text-[12px] ${
          showAdd ? "text-status-warn-fg" : "text-ds-text-3"
        }`}
      >
        {value ?? (showAdd ? "Agregar" : "—")}
      </span>
      {showAdd ? (
        <span
          className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-status-warn-border bg-status-warn-soft text-status-warn-fg"
          aria-hidden
        >
          <Plus className="h-3.5 w-3.5" />
        </span>
      ) : canNavigate ? (
        <ArrowUpRight className="relative h-4 w-4 shrink-0 text-ds-text-4" aria-hidden />
      ) : null}
    </button>
  );
}
