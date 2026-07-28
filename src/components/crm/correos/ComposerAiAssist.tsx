"use client";

import { useEffect, useRef } from "react";
import { ArrowUp, WandSparkles, X } from "lucide-react";
import { Spinner } from "@/components/opai-ds";
import { cn } from "@/lib/utils";

type PillProps = {
  value: string;
  onChange: (value: string) => void;
  onGenerate: () => void;
  onClose: () => void;
  generating: boolean;
};

/**
 * Pill estilo Gmail "Help me write": vive entre el cuerpo del mail y la barra
 * de Enviar. Enter / flecha generan borrador en el editor (no envían el mail).
 */
export function ComposerAiPromptPill({
  value,
  onChange,
  onGenerate,
  onClose,
  generating,
}: PillProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Autofocus al abrir; en móvil el teclado queda listo para el prompt.
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div
      role="region"
      aria-label="Responder con IA"
      className="flex items-center gap-1.5 py-1.5"
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-full border px-2.5",
          "border-ds-border-default bg-ds-surface-2",
          "focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30",
        )}
      >
        <WandSparkles
          className="h-4 w-4 shrink-0 text-tint-violet-fg"
          aria-hidden
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Escape lo cierra el capture del host (CorreoComposerBox); no
            // duplicar acá o el toggle se dispara dos veces.
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!generating) onGenerate();
            }
          }}
          placeholder="Indicá cómo querés responder…"
          disabled={generating}
          aria-label="Prompt para la IA"
          className={cn(
            "h-10 min-w-0 flex-1 bg-transparent text-[16px] text-ds-text-1 outline-none",
            "placeholder:text-ds-text-4 disabled:opacity-60 sm:h-9 sm:text-[13px]",
          )}
        />
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          title={generating ? "Generando…" : value.trim() ? "Generar borrador" : "Generar sin indicaciones"}
          aria-label={generating ? "Generando borrador" : "Generar borrador"}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ds-tap sm:h-8 sm:w-8",
            "bg-primary text-primary-foreground disabled:opacity-60",
          )}
        >
          {generating ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </button>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar asistente IA"
        title="Cerrar"
        className={cn(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full ds-tap",
          "text-ds-text-3 hover:bg-ds-surface-2 hover:text-ds-text-1 sm:h-9 sm:w-9",
        )}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

type ToggleProps = {
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
};

/** Botón lápiz+estrella en la barra inferior: prende/apaga la pill. */
export function ComposerAiAssistToggle({ open, onToggle, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      title={open ? "Cerrar asistente IA" : "Responder con IA"}
      aria-label={open ? "Cerrar asistente IA" : "Responder con IA"}
      aria-pressed={open}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full ds-tap sm:h-9 sm:w-9",
        "disabled:opacity-50",
        open
          ? "bg-tint-violet text-tint-violet-fg"
          : "text-ds-text-2 hover:bg-ds-surface-2",
      )}
    >
      <WandSparkles className="h-4 w-4" />
    </button>
  );
}
