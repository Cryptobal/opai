"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, MoreVertical, WandSparkles, X } from "lucide-react";
import { Spinner, Surface } from "@/components/opai-ds";
import { hideKeyboardAccessoryBar } from "@/lib/capacitor/hideKeyboardAccessoryBar";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  DRAFT_REFINE_CHIPS,
  type DraftRefineMode,
} from "@/modules/crm/email/draft-reply-refine";
import { ComposerSheetPortal } from "./ComposerSheetPortal";

export type { DraftRefineMode };

type AssistMode = "reply" | "compose";

type PillProps = {
  value: string;
  onChange: (value: string) => void;
  /** Generar borrador nuevo o aplicar cambio libre sobre el actual. */
  onGenerate: () => void;
  /** Preset de refinamiento (solo con borrador ya generado). */
  onRefine: (preset: DraftRefineMode) => void;
  onClose: () => void;
  generating: boolean;
  /** Hay texto refinable en el editor (IA o escrito a mano). */
  hasDraft: boolean;
  /** Abre el sheet de estilo de respuesta. */
  onOpenStyle?: () => void;
  /** reply = respuesta a hilo; compose = mensaje nuevo. */
  mode?: AssistMode;
};

/**
 * Pill estilo Gmail "Help me write": va justo debajo del cuerpo editable
 * (antes del historial citado). `sticky bottom` la mantiene usable al
 * scrollear el hilo / con teclado. Los presets viven en el kebab (⋮); el
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
  mode = "reply",
}: PillProps) {
  const isCompose = mode === "compose";
  const inputRef = useRef<HTMLInputElement>(null);
  const kebabRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  // Foco al abrir: caret parpadeando en el prompt (doble rAF + timeout por
  // si el composer aún está montando tras Responder / Reenviar).
  useEffect(() => {
    let cancelled = false;
    const focus = () => {
      if (!cancelled) inputRef.current?.focus({ preventScroll: true });
    };
    const raf = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(focus);
    });
    const t = window.setTimeout(focus, 80);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
    };
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
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (kebabRef.current?.contains(t)) return;
      // Sheet móvil va a body (fuera del kebab); no cerrar antes del click del ítem.
      if ((e.target as HTMLElement | null)?.closest?.("[data-composer-sheet]")) return;
      setMenuOpen(false);
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [menuOpen]);

  const presetsDisabled = !hasDraft || generating;

  const menuItems = (
    <>
      {DRAFT_REFINE_CHIPS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          role="menuitem"
          disabled={presetsDisabled}
          aria-disabled={presetsDisabled}
          onClick={() => {
            setMenuOpen(false);
            onRefine(chip.id);
          }}
          className="flex min-h-11 w-full items-center px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 disabled:opacity-40 disabled:text-ds-text-4 sm:min-h-9"
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
    <div
      role="region"
      aria-label={isCompose ? "Redactar con IA" : "Responder con IA"}
      // sticky bottom: al scrollear el historial / con teclado, el ↑ sigue usable.
      // El host la monta bajo el cuerpo (no bajo el historial).
      className="sticky bottom-0 z-20 space-y-1.5 bg-background py-1.5"
    >
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 rounded-full px-2.5",
            "bg-ds-surface-2",
          )}
        >
          <WandSparkles
            className="h-4 w-4 shrink-0 text-ds-text-3"
            aria-hidden
          />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => {
              // iOS reactiva ◀▶✓ al enfocar; re-ocultar al toque.
              void hideKeyboardAccessoryBar();
            }}
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
                : isCompose
                  ? "Indicá qué querés redactar…"
                  : "Indicá cómo querés responder…"
            }
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            disabled={generating}
            aria-label={hasDraft ? "Describir cambio del borrador" : "Prompt para la IA"}
            className={cn(
              "h-10 min-w-0 flex-1 appearance-none border-0 bg-transparent text-[16px] text-ds-text-1 shadow-none outline-none ring-0",
              "placeholder:text-ds-text-4 disabled:opacity-60 sm:h-9 sm:text-[13px]",
              "focus:border-0 focus:outline-none focus:ring-0 focus:ring-offset-0",
              "focus-visible:border-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
            )}
          />
          <div className="relative shrink-0" ref={kebabRef}>
            <button
              type="button"
              aria-label="Más opciones de IA"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => {
                inputRef.current?.blur();
                setMenuOpen((o) => !o);
              }}
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

      {!isDesktop && (
        <ComposerSheetPortal open={menuOpen} onClose={() => setMenuOpen(false)}>
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
            {!hasDraft && (
              <p className="px-4 pb-1 text-[12px] text-ds-text-3">
                Escribí o generá un borrador para refinarlo
              </p>
            )}
            <div className="py-1">{menuItems}</div>
          </Surface>
        </ComposerSheetPortal>
      )}
    </div>
  );
}

type ToggleProps = {
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  /** reply = "Responder con IA"; compose = "Redactar con IA". */
  mode?: AssistMode;
};

/** Botón lápiz+estrella en la barra inferior: prende/apaga la pill. */
export function ComposerAiAssistToggle({
  open,
  onToggle,
  disabled,
  mode = "reply",
}: ToggleProps) {
  const openLabel = mode === "compose" ? "Redactar con IA" : "Responder con IA";
  return (
    <button
      type="button"
      title={open ? "Cerrar asistente IA" : openLabel}
      aria-label={open ? "Cerrar asistente IA" : openLabel}
      aria-pressed={open}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full ds-tap sm:h-9 sm:w-9",
        "disabled:opacity-50",
        open
          ? "text-primary hover:bg-ds-surface-2"
          : "text-ds-text-2 hover:bg-ds-surface-2",
      )}
    >
      <WandSparkles className="h-4 w-4" />
    </button>
  );
}

