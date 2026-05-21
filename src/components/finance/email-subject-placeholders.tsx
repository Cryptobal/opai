"use client";

/**
 * Chips clickeables que insertan `{{token}}` en un input controlado.
 *
 * Uso:
 *   <PlaceholderChips
 *     tokens={["cliente", "instalacion", "mes", "folio"]}
 *     inputRef={inputRef}
 *     value={value}
 *     onChange={setValue}
 *   />
 *
 * Inserta en la posición del caret si el input está enfocado; al final
 * en caso contrario. Mantiene el foco después de insertar.
 */

import { type RefObject } from "react";

interface Props {
  tokens: readonly string[];
  /** Ref del input/textarea destino. */
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  /** Valor actual del input (controlado). */
  value: string;
  /** Setter del valor (recibe el nuevo string). */
  onChange: (next: string) => void;
}

export function PlaceholderChips({ tokens, inputRef, value, onChange }: Props) {
  const insertToken = (token: string) => {
    const fragment = `{{${token}}}`;
    const el = inputRef.current;
    if (!el || document.activeElement !== el) {
      // Sin foco: append al final.
      const sep = value.length > 0 && !/\s$/.test(value) ? " " : "";
      onChange(value + sep + fragment);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + fragment + value.slice(end);
    onChange(next);
    // Restaurar caret después del fragment, en el próximo tick (después de
    // que React re-renderee con el nuevo `value`).
    requestAnimationFrame(() => {
      const elNow = inputRef.current;
      if (!elNow) return;
      elNow.focus();
      const caret = start + fragment.length;
      elNow.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="flex flex-wrap gap-1">
      {tokens.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => insertToken(t)}
          className="inline-flex items-center rounded-full border border-ds-border-subtle bg-muted/40 px-2 py-0.5 text-[12px] font-mono text-ds-text-2 transition hover:bg-muted hover:text-ds-text-1"
          title={`Insertar {{${t}}}`}
        >
          + {t}
        </button>
      ))}
    </div>
  );
}
