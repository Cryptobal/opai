"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered, Underline } from "lucide-react";

type Props = {
  /** HTML del contenido. */
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

const BTN =
  "flex h-8 w-8 items-center justify-center rounded-md text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1";

/**
 * Editor de texto enriquecido mínimo para responder correos (negrita, cursiva,
 * subrayado, lista) — estilo Gmail, sin dependencias. contentEditable +
 * execCommand: deprecado pero universal, suficiente para un borrador de mail.
 */
export function RichTextEditor({ value, onChange, placeholder }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Sincroniza solo cambios externos (p.ej. borrador generado por IA); si el
  // HTML ya coincide, no tocar el DOM para no perder el caret al tipear.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  function exec(cmd: string) {
    ref.current?.focus();
    document.execCommand(cmd);
    if (ref.current) onChange(ref.current.innerHTML);
  }

  const tools: Array<[string, typeof Bold, string]> = [
    ["bold", Bold, "Negrita"],
    ["italic", Italic, "Cursiva"],
    ["underline", Underline, "Subrayado"],
    ["insertUnorderedList", List, "Lista con viñetas"],
    ["insertOrderedList", ListOrdered, "Lista numerada"],
  ];

  return (
    <div className="rounded-lg border border-ds-border-default bg-ds-surface-1">
      <div className="flex items-center gap-0.5 border-b border-ds-border-subtle px-1 py-0.5">
        {tools.map(([cmd, Icon, label]) => (
          <button
            key={cmd}
            type="button"
            aria-label={label}
            title={label}
            // preventDefault en mousedown: no robar el foco ni la selección.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(cmd)}
            className={BTN}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? ""}
        onInput={() => ref.current && onChange(ref.current.innerHTML)}
        className="min-h-28 w-full p-2 text-[13px] text-ds-text-1 outline-none [&:empty]:before:pointer-events-none [&:empty]:before:text-ds-text-4 [&:empty]:before:content-[attr(data-placeholder)]"
      />
    </div>
  );
}
