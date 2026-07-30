"use client";

import { ArrowUpRight, Pencil, Plus, type LucideIcon } from "lucide-react";

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
  /** Con valor y editable: abre el omnibox para cambiar/quitar. */
  onEdit?: () => void;
  /** Acción secundaria (p. ej. expandir contactos). */
  onActivate?: () => void;
};

/**
 * Fila de la cascada editable (Copiloto v4).
 * Sin valor: ＋ abre el buscador. Con valor: fila navega (↗); lápiz edita
 * sin anidar botones (controles hermanos en un flex, no button-dentro-de-button).
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
  onEdit,
  onActivate,
}: Props) {
  const showAdd = !hasValue && editable && !disabled;
  const showEdit = hasValue && editable && !disabled && Boolean(onEdit);
  const canNavigate = hasValue && Boolean(href);
  const mainDisabled = disabled || (!showAdd && !canNavigate && !onActivate);

  function handleMainClick() {
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
    <div
      className="relative flex min-h-11 w-full items-center"
      style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: 4 }}
    >
      {depth > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 top-0 border-l-2 border-primary/30"
          style={{ left: `${12 + (depth - 1) * 16 + 7}px` }}
        />
      )}
      <button
        type="button"
        onClick={handleMainClick}
        disabled={mainDisabled}
        className="relative flex min-h-11 min-w-0 flex-1 items-center gap-2.5 py-2 pr-1 text-left ds-tap hover:bg-ds-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
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
      {showEdit && (
        <button
          type="button"
          aria-label={`Editar ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:h-9 sm:w-9"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
