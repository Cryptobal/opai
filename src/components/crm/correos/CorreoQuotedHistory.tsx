"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** HTML ya sanitizado (mismo pipeline que el lector). */
  html: string;
  /** Expandido por defecto en reply / reply-all / forward. */
  defaultExpanded?: boolean;
  className?: string;
};

/**
 * Bloque de solo lectura con el hilo citado, fuera del contenteditable.
 * Colapsable (⋯ Historial); al estar cerrado no monta el HTML (hilos largos).
 */
export function CorreoQuotedHistory({
  html,
  defaultExpanded = true,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!html.trim()) return null;

  return (
    <div
      className={cn(
        "border-t border-ds-border-subtle pt-1",
        className,
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="correo-quoted-history"
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-11 w-full items-center gap-2 rounded-xl px-1 text-left text-[13px] font-medium text-ds-text-3 ds-tap hover:text-ds-text-1"
      >
        <span aria-hidden className="text-ds-text-4">⋯</span>
        Historial
      </button>
      {expanded && (
        <div
          id="correo-quoted-history"
          className={cn(
            "mt-1 overflow-x-auto rounded-xl border border-ds-border-subtle bg-ds-surface-2/60 px-3 py-2.5",
            "text-[13px] leading-relaxed text-ds-text-2",
            "[&_a]:text-primary [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2",
            "[&_blockquote]:border-ds-border-default [&_blockquote]:pl-3 [&_blockquote]:text-ds-text-3",
            "[&_img]:max-w-full [&_img]:h-auto [&_p]:my-1.5 [&_table]:my-2 [&_table]:max-w-full",
          )}
          // HTML ya pasó por sanitizeEmailHtml (sin scripts / handlers).
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
