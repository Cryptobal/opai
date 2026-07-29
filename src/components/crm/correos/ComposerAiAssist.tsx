"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUp, MoreVertical, WandSparkles, X } from "lucide-react";
import { Spinner, Surface } from "@/components/opai-ds";
import { cn } from "@/lib/utils";
import {
  DRAFT_REFINE_CHIPS,
  type DraftRefineMode,
} from "@/modules/crm/email/draft-reply-refine";

export type { DraftRefineMode };

type PillProps = {
  value: string;
  onChange: (value: string) => void;
  /** Generar borrador nuevo o aplicar cambio libre sobre el actual. */
  onGenerate: () => void;
  /** Preset de refinamiento (solo con borrador ya generado). */
  onRefine: (preset: DraftRefineMode) => void;
  onClose: () => void;
  generating: boolean;
  /** Ya hay texto de IA en el editor → kebab de presets habilitado. */
  hasDraft: boolean;
  /** Abre el sheet de estilo de respuesta. */
  onOpenStyle?: () => void;
};

/**
 * Pill estilo Gmail "Help me write": vive entre el cuerpo del mail y la barra
 * de Enviar. Los presets de refinamiento viven en un kebab (⋮); el campo de
 * prompt abre vacío hasta que el usuario escribe y manda ↑.
 */
export function ComposerAiPromptPill({
  value,
  onChange,
  onGenerate,
  onRefine,
  onClose,
  generating,
  hasDraft,
  onOpenStyle,
}: PillProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const kebabRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMenuOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  const menuItems = (
    <>
      {DRAFT_REFINE_CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="menuitem"
          disabled={!hasDraft || generating}
          onClick={() => {
            setMenuOpen(false);
            onRefine(chip.id);
          }}
          className="flex min-h-11 w-full items-center px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 disabled:opacity-40 sm:min-h-9"
        >
          {chip.label}
        </button>
      ))}
      <div className="my-1 h-px bg-ds-border-subtle" aria-hidden />
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setMenuOpen(false);
          onOpenStyle?.();
        }}
        className="flex min-h-11 w-full items-center px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9"
      >
        Estilo de respuesta…
      </button>
    </>
  );

  return (
    <div role="region" aria-label="Responder con IA" className="space-y-1.5 py-1.5">
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-full border px-2.5",
            "border-ds-border-default bg-ds-surface-2 focus-within:border-ds-border-strong",
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
              e.stopPropagation();
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!generating) onGenerate();
              }
            }}
            placeholder={
              hasDraft
                ? "Describí un cambio…"
                : "Indicá cómo querés responder…"
            }
            disabled={generating}
            aria-label={hasDraft ? "Describir cambio del borrador" : "Prompt para la IA"}
            className={cn(
              "h-10 min-w-0 flex-1 bg-transparent text-[16px] text-ds-text-1 outline-none ring-0",
              "placeholder:text-ds-text-4 disabled:opacity-60 sm:h-9 sm:text-[13px]",
              "focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0",
            )}
          />
          <div className="relative shrink-0" ref={kebabRef}>
            <button
              type="button"
              aria-label="Más opciones de IA"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full ds-tap sm:h-8 sm:w-8",
                "text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1",
              )}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && isDesktop && (
              <Surface
                elevation={4}
                padding="none"
                role="menu"
                aria-label="Refinar borrador"
                className="absolute bottom-full right-0 z-50 mb-1 w-48 overflow-hidden py-1"
              >
                {menuItems}
              </Surface>
            )}
          </div>
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || (hasDraft && !value.trim())}
            title={
              generating
                ? "Generando…"
                : hasDraft
                  ? "Aplicar cambio"
                  : value.trim()
                    ? "Generar borrador"
                    : "Generar sin indicaciones"
            }
            aria-label={
              generating
                ? "Generando borrador"
                : hasDraft
                  ? "Aplicar cambio"
                  : "Generar borrador"
            }
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

      {menuOpen && !isDesktop &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 lg:hidden"
            onClick={() => setMenuOpen(false)}
          >
            <Surface
              elevation={4}
              padding="none"
              role="menu"
              aria-label="Refinar borrador"
              className="w-full rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-ds-surface-3" />
              <p className="px-4 pb-1 pt-2 font-display text-[15px] font-semibold text-ds-text-1">
                Refinar borrador
              </p>
              <div className="py-1">{menuItems}</div>
            </Surface>
          </div>,
          document.body,
        )}
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

/** Tarjeta de sugerencia del borrador precomputado del Radar (nunca auto-inyecta). */
export function ComposerAiDraftSuggestion({
  draft,
  onUse,
  onDismiss,
}: {
  draft: string;
  onUse: () => void;
  onDismiss: () => void;
}) {
  const excerpt = draft.trim().split(/\s+/).slice(0, 140).join(" ");
  return (
    <div
      role="region"
      aria-label="Borrador sugerido por el Radar"
      className="rounded-xl border border-tint-violet/30 bg-tint-violet/10 px-3 py-2.5"
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <WandSparkles className="h-3.5 w-3.5 shrink-0 text-tint-violet-fg" aria-hidden />
        <p className="text-[13px] font-medium text-ds-text-1">
          El Radar tiene un borrador guardado para este hilo
        </p>
      </div>
      <p className="line-clamp-3 text-[13px] text-ds-text-2">{excerpt}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onUse}
          className="inline-flex h-10 items-center rounded-full bg-primary px-3 text-[13px] font-medium text-primary-foreground ds-tap sm:h-9"
        >
          Usar este borrador
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex h-10 items-center rounded-full border border-ds-border-default px-3 text-[13px] text-ds-text-2 ds-tap sm:h-9"
        >
          Descartar
        </button>
      </div>
    </div>
  );
}
