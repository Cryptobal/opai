"use client";

import { useCallback, useEffect, useState } from "react";
import { Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AI_SHORTCUT_PRESETS,
  AI_SHORTCUT_RECORDER_ATTR,
  combosEqual,
  formatCombo,
  modSymbol,
  readAiShortcutConfig,
  serializeCombo,
  validateCombo,
  writeAiShortcutConfig,
  type AiShortcutConfig,
  type ShortcutCombo,
} from "@/lib/ai/ai-shortcut";

export function AiShortcutConfigCard() {
  const [cfg, setCfg] = useState<AiShortcutConfig>(() =>
    typeof window === "undefined"
      ? {
          enabled: true,
          combo: { key: "j", mod: true },
          sendQueryAsPrompt: true,
        }
      : readAiShortcutConfig(),
  );
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCfg(readAiShortcutConfig());
  }, []);

  const persist = useCallback((partial: Partial<AiShortcutConfig>) => {
    const next = writeAiShortcutConfig(partial);
    setCfg(next);
  }, []);

  useEffect(() => {
    if (!armed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setArmed(false);
        setError(null);
        return;
      }
      // Ignorar solo modificadores
      if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) return;

      const combo: ShortcutCombo = {
        key: e.key,
        mod: e.metaKey || e.ctrlKey,
        shift: e.shiftKey,
        alt: e.altKey,
      };
      const validation = validateCombo(combo);
      if (!validation.ok) {
        setError(validation.reason);
        setArmed(false);
        return;
      }
      setError(null);
      setArmed(false);
      persist({ combo });
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [armed, persist]);

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4 min-w-0 overflow-hidden">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">
          <Keyboard className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">Atajo de teclado</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Abre el asistente IA desde cualquier pantalla. Se guarda en este navegador.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm min-h-10 sm:min-h-0">
        <input
          type="checkbox"
          className="accent-primary h-4 w-4"
          checked={cfg.enabled}
          onChange={(e) => persist({ enabled: e.target.checked })}
        />
        Atajo habilitado
      </label>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Combinación actual</p>
        <button
          type="button"
          {...{ [AI_SHORTCUT_RECORDER_ATTR]: "" }}
          onClick={() => {
            setError(null);
            setArmed(true);
          }}
          className={cn(
            "inline-flex items-center justify-center min-h-11 sm:min-h-9 px-4 rounded-lg border text-sm font-mono",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            armed
              ? "border-primary bg-primary/10 text-primary animate-pulse"
              : "border-ds-border-default bg-ds-surface-2 text-foreground hover:bg-ds-surface-3",
          )}
          aria-pressed={armed}
        >
          {armed ? `Pulsa una combinación con ${modSymbol()}…` : formatCombo(cfg.combo)}
        </button>
        {error && (
          <p className="text-[13px] text-status-danger-fg" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Presets</p>
        <div className="flex flex-wrap gap-2">
          {AI_SHORTCUT_PRESETS.map((preset) => {
            const active = combosEqual(preset.combo, cfg.combo);
            const reserved = !validateCombo(preset.combo).ok;
            return (
              <button
                key={serializeCombo(preset.combo)}
                type="button"
                disabled={reserved}
                aria-pressed={active}
                onClick={() => {
                  const v = validateCombo(preset.combo);
                  if (!v.ok) {
                    setError(v.reason);
                    return;
                  }
                  setError(null);
                  persist({ combo: preset.combo });
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 min-h-11 sm:min-h-9 px-3 rounded-lg border text-[13px] font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-ds-border-subtle bg-ds-surface-1 text-ds-text-2 hover:bg-ds-surface-2",
                  reserved && "opacity-40 cursor-not-allowed",
                )}
              >
                <span className="font-mono">{formatCombo(preset.combo)}</span>
                {preset.recommended && (
                  <span className="text-[12px] text-ds-text-4">recomendado</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm min-h-10 sm:min-h-0">
        <input
          type="checkbox"
          className="accent-primary h-4 w-4 mt-0.5"
          checked={cfg.sendQueryAsPrompt}
          onChange={(e) => persist({ sendQueryAsPrompt: e.target.checked })}
        />
        <span>
          Enviar la búsqueda del palette como pregunta inicial
          <span className="block text-xs text-muted-foreground mt-0.5">
            Si el buscador (⌘K) está abierto con texto y usas el atajo IA, se envía al chat.
          </span>
        </span>
      </label>
    </section>
  );
}
