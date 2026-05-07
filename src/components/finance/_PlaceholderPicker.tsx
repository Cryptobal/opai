"use client";

/**
 * PlaceholderPicker — popover compartido para insertar placeholders
 * (`{{periodo}}`, `{{uf_valor}}`, etc.) en un input o textarea.
 *
 * Modos:
 *   - "literal" (plantillas recurrentes): inserta el `{{token}}` tal
 *     cual. El cron se encarga de resolverlo en cada run.
 *   - "resolved" (DTE one-shot): inserta el VALOR ya resuelto contra
 *     el contexto del momento. Texto plano, sin `{{...}}` en el draft.
 *
 * Usa un `inputRef` (HTMLInputElement | HTMLTextAreaElement) para
 * insertar en la posición del cursor. El caller mantiene el state
 * y refleja el nuevo valor con `onInsert(newValue)`.
 */

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import {
  PLACEHOLDER_CATALOG,
  resolvePlaceholders,
  type PlaceholderContext,
} from "@/modules/finance/billing/placeholders";

interface Props {
  /** Ref del input/textarea donde insertar. */
  targetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  /** Valor actual del input/textarea (controlled). */
  value: string;
  /**
   * Callback cuando se inserta. Recibe el NUEVO valor completo
   * (con el token/valor insertado en la posición del cursor).
   */
  onInsert: (newValue: string) => void;
  /**
   * Modo de inserción:
   *   - "literal": inserta `{{token}}` (plantillas recurrentes).
   *   - "resolved": inserta el valor resuelto contra `ctx`.
   */
  mode: "literal" | "resolved";
  /**
   * Contexto para resolver placeholders. Requerido en modo "resolved";
   * en modo "literal" se usa solo para mostrar la previsualización en
   * cada item del menú (ej: "Período → Mayo 2026").
   */
  ctx: PlaceholderContext;
  /** Texto del botón disparador (default: "Insertar placeholder"). */
  triggerLabel?: string;
  /** Clase para el botón disparador. */
  triggerClassName?: string;
  /** Si true, oculta tokens UF cuando currency=CLP. */
  hideUfWhenClp?: boolean;
}

export function PlaceholderPicker({
  targetRef,
  value,
  onInsert,
  mode,
  ctx,
  triggerLabel = "Insertar placeholder",
  triggerClassName,
  hideUfWhenClp = true,
}: Props) {
  const [open, setOpen] = React.useState(false);

  const insertAtCursor = React.useCallback(
    (textToInsert: string) => {
      const el = targetRef.current;
      if (!el) {
        // Sin ref: append al final como fallback razonable.
        onInsert(value + textToInsert);
        return;
      }
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + textToInsert + value.slice(end);
      onInsert(next);
      setOpen(false);
      // Re-foco + posicionar cursor al final del texto insertado, en el
      // próximo tick para que React haya renderizado el nuevo valor.
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + textToInsert.length;
        el.setSelectionRange(pos, pos);
      });
    },
    [targetRef, value, onInsert],
  );

  const handlePick = React.useCallback(
    (token: string) => {
      const insertion =
        mode === "literal" ? token : resolvePlaceholders(token, ctx);
      insertAtCursor(insertion);
    },
    [mode, ctx, insertAtCursor],
  );

  const items = React.useMemo(
    () =>
      PLACEHOLDER_CATALOG.filter(
        (it) => !(hideUfWhenClp && ctx.currency === "CLP" && !it.appliesToClp),
      ),
    [ctx.currency, hideUfWhenClp],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={
            triggerClassName ??
            "h-7 px-2 text-[12px] text-primary hover:bg-primary/10"
          }
        >
          <Plus className="h-3 w-3 mr-1" />
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[min(360px,calc(100vw-24px))] p-1 max-h-[60vh] overflow-y-auto"
      >
        <div className="space-y-0.5">
          <div className="px-2 py-1.5 text-[12px] font-medium uppercase tracking-wide text-ds-text-3">
            {mode === "literal" ? "Insertar token" : "Insertar valor actual"}
          </div>
          {items.map((it) => {
            const previewValue = resolvePlaceholders(it.token, ctx);
            return (
              <button
                key={it.token}
                type="button"
                onClick={() => handlePick(it.token)}
                className="w-full text-left px-2 py-2 rounded hover:bg-accent transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2 min-w-0">
                  <span className="text-[13px] font-medium text-ds-text-1 leading-tight truncate">
                    {it.label}
                  </span>
                  <span className="text-[12px] font-mono text-primary leading-tight truncate text-right shrink-0 max-w-[55%]">
                    {previewValue || (
                      <span className="text-ds-text-4 italic">—</span>
                    )}
                  </span>
                </div>
                <p className="text-[12px] text-ds-text-3 mt-1 leading-snug">
                  {it.description}
                </p>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
