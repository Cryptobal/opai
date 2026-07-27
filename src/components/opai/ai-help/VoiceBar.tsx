"use client";

import { useEffect, useRef } from "react";
import { Check, Mic, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MutableRefObject } from "react";

const BAR_COUNT = 22;

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function VoiceBar({
  levelRef,
  elapsedMs,
  silent,
  confirmedText,
  interimText,
  onCancel,
  onFinish,
  onSend,
  disabled,
}: {
  levelRef: MutableRefObject<number>;
  elapsedMs: number;
  silent?: boolean;
  confirmedText: string;
  interimText: string;
  onCancel: () => void;
  onFinish: () => void;
  onSend: () => void;
  disabled?: boolean;
}) {
  const barsRef = useRef<Array<HTMLSpanElement | null>>([]);
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    const tick = () => {
      const level = levelRef.current;
      for (let i = 0; i < BAR_COUNT; i += 1) {
        const el = barsRef.current[i];
        if (!el) continue;
        const wave = Math.abs(Math.sin(Date.now() / 180 + i * 0.45));
        const h = 4 + (level * 0.85 + wave * 0.15) * 22;
        el.style.height = `${h}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef, reducedMotion]);

  return (
    <div className="space-y-2 rounded-[19px] border border-ds-border-default bg-ds-surface-2 p-3">
      <p
        aria-live="polite"
        className="line-clamp-3 min-h-[3.75rem] text-[13px] leading-snug text-ds-text-1"
      >
        {confirmedText ? <span>{confirmedText}</span> : null}
        {interimText ? (
          <span className="text-ds-text-4">{confirmedText ? " " : ""}{interimText}</span>
        ) : null}
        {!confirmedText && !interimText ? (
          <span className="text-ds-text-4">Escuchando…</span>
        ) : null}
      </p>

      {silent ? (
        <p className="text-[12px] text-status-warn-fg">¿Sigues ahí? No detecto habla.</p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Descartar dictado"
          onClick={onCancel}
          disabled={disabled}
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-status-danger-soft text-status-danger-fg"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex min-w-0 flex-1 items-end justify-center gap-[3px] h-8" aria-hidden>
          {reducedMotion ? (
            <Mic className="h-4 w-4 text-primary" />
          ) : (
            Array.from({ length: BAR_COUNT }, (_, i) => (
              <span
                key={i}
                ref={(el) => {
                  barsRef.current[i] = el;
                }}
                className="w-[3px] rounded-full bg-primary/80"
                style={{ height: 4 }}
              />
            ))
          )}
        </div>

        <span className="inline-flex items-center gap-1.5 shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-status-danger opacity-60" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-status-danger" />
          </span>
          <span className="font-mono text-[12px] tabular-nums text-ds-text-2">
            {formatElapsed(elapsedMs)}
          </span>
        </span>

        <button
          type="button"
          aria-label="Conservar dictado"
          onClick={onFinish}
          disabled={disabled}
          className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-ds-surface-3 text-ds-text-1"
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Enviar dictado"
          onClick={onSend}
          disabled={disabled}
          className={cn(
            "inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full",
            "bg-primary text-primary-foreground",
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
