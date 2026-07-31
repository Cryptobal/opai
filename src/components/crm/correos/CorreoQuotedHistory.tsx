"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** HTML ya sanitizado (mismo pipeline que el lector). Composer. */
  html?: string;
  /** Contenido diferido (lector): solo se monta al expandir. */
  children?: ReactNode;
  /** `composer`: bloque "⋯ Historial". `reader`: pastilla `•••` estilo Gmail. */
  variant?: "composer" | "reader";
  /** Expandido por defecto en reply / reply-all / forward. */
  defaultExpanded?: boolean;
  className?: string;
};

/**
 * Bloque de solo lectura con el hilo citado, fuera del contenteditable.
 * Colapsable; al estar cerrado NO monta el contenido (hilos largos).
 */
export function CorreoQuotedHistory({
  html,
  children,
  variant = "composer",
  defaultExpanded = true,
  className,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasHtml = Boolean(html?.trim());
  if (!hasHtml && !children) return null;

  const content = children ?? (
    <div
      className={cn(
        "overflow-x-auto rounded-xl border border-ds-border-subtle bg-ds-surface-2/60 px-3 py-2.5",
        "text-[13px] leading-relaxed text-ds-text-2",
        "[&_a]:text-primary [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-2",
        "[&_blockquote]:border-ds-border-default [&_blockquote]:pl-3 [&_blockquote]:text-ds-text-3",
        "[&_img]:max-w-full [&_img]:h-auto [&_p]:my-1.5 [&_table]:my-2 [&_table]:max-w-full",
      )}
      // HTML ya pasó por sanitizeEmailHtml (sin scripts / handlers).
      dangerouslySetInnerHTML={{ __html: html ?? "" }}
    />
  );

  if (variant === "reader") {
    return (
      <div className={cn("mt-1", className)}>
        {expanded ? (
          <div className="space-y-1.5">
            <div className="border-l-2 border-ds-border-subtle pl-2 text-[13px] text-ds-text-4">
              {content}
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex min-h-11 items-center rounded-full px-2 text-[12px] font-medium text-ds-text-3 ds-tap hover:text-ds-text-1 sm:min-h-8"
            >
              Ocultar historial
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-expanded={false}
            aria-label="Mostrar contenido recortado"
            title="Mostrar contenido recortado"
            onClick={() => setExpanded(true)}
            className="inline-flex h-11 items-center rounded-full bg-ds-surface-3 px-3 text-[13px] font-semibold leading-none text-ds-text-3 ds-tap hover:bg-ds-surface-4 hover:text-ds-text-1 sm:h-[22px] sm:px-2"
          >
            <span aria-hidden>•••</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("border-t border-ds-border-subtle pt-1", className)}>
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
      {expanded && <div id="correo-quoted-history" className="mt-1">{content}</div>}
    </div>
  );
}
