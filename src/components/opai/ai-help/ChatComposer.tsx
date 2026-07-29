"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Loader2, Mic, Paperclip, Send, Sparkles, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VoiceBar } from "./VoiceBar";
import type { MutableRefObject } from "react";

/** Enfoca el composer IA visible (desktop u hoja móvil). */
export function focusAiHelpComposer() {
  const nodes = document.querySelectorAll<HTMLTextAreaElement>(
    "textarea[data-opai-ai-composer]",
  );
  for (const el of nodes) {
    if (el.getClientRects().length === 0 || el.disabled) continue;
    el.focus({ preventScroll: true });
    return true;
  }
  return false;
}

export function ChatComposer({
  input,
  onInputChange,
  onSend,
  onStop,
  sending,
  staging,
  pendingFiles,
  onAddFiles,
  onRemoveFile,
  dictationActive,
  dictationSupported,
  onToggleDictation,
  voiceProps,
  polishEnabled,
  onPolishChange,
  disabled,
  autoFocus = true,
  focusToken,
}: {
  input: string;
  onInputChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  sending: boolean;
  staging: boolean;
  pendingFiles: File[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (idx: number) => void;
  dictationActive: boolean;
  dictationSupported: boolean;
  onToggleDictation: () => void;
  voiceProps?: {
    levelRef: MutableRefObject<number>;
    elapsedMs: number;
    silent?: boolean;
    confirmedText: string;
    interimText: string;
    onCancel: () => void;
    onFinish: () => void;
    onSend: () => void;
  };
  polishEnabled: boolean;
  onPolishChange: (v: boolean) => void;
  disabled?: boolean;
  /** Enfoca el textarea al montar / al cambiar focusToken (abrir panel, volver de hilos). */
  autoFocus?: boolean;
  focusToken?: number | string | boolean;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input, dictationActive]);

  useEffect(() => {
    if (dictationActive) taRef.current?.blur();
  }, [dictationActive]);

  // useLayoutEffect: enfoca antes del paint, más cerca del gesto de apertura.
  useLayoutEffect(() => {
    if (!autoFocus || dictationActive || disabled) return;
    const focus = () => {
      const el = taRef.current;
      if (!el || el.getClientRects().length === 0) return;
      el.focus({ preventScroll: true });
    };
    focus();
    let cancelled = false;
    let timeoutId = 0;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      focus();
      timeoutId = window.setTimeout(() => {
        if (!cancelled) focus();
      }, 100);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timeoutId);
    };
  }, [autoFocus, dictationActive, disabled, focusToken]);

  if (dictationActive && voiceProps) {
    return (
      <VoiceBar
        levelRef={voiceProps.levelRef}
        elapsedMs={voiceProps.elapsedMs}
        silent={voiceProps.silent}
        confirmedText={voiceProps.confirmedText}
        interimText={voiceProps.interimText}
        onCancel={voiceProps.onCancel}
        onFinish={voiceProps.onFinish}
        onSend={voiceProps.onSend}
        disabled={disabled || staging}
      />
    );
  }

  return (
    <div className="space-y-2">
      {pendingFiles.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {pendingFiles.map((f, i) => (
            <span
              key={`${f.name}-${f.size}-${i}`}
              className="inline-flex max-w-[200px] items-center gap-1 rounded-md border border-ds-border-default bg-ds-surface-2 px-2 py-1 text-[12px] text-ds-text-2"
            >
              <Paperclip className="h-3 w-3 shrink-0" />
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => onRemoveFile(i)}
                aria-label={`Quitar ${f.name}`}
                className="shrink-0 text-ds-text-3 hover:text-ds-text-1"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="rounded-[19px] border border-ds-border-subtle bg-ds-surface-2 focus-within:border-primary/40">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.xlsx,.xls,.csv,.docx,image/png,image/jpeg,image/webp,image/gif,application/pdf"
          className="hidden"
          onChange={(e) => {
            onAddFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <textarea
          ref={taRef}
          rows={1}
          data-opai-ai-composer
          placeholder="Escribe o dicta tu pregunta…"
          value={input}
          autoFocus={autoFocus && !dictationActive && !disabled}
          onChange={(e) => onInputChange(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.items ?? [])
              .filter((it) => it.kind === "file")
              .map((it) => it.getAsFile())
              .filter((f): f is File => f !== null);
            if (files.length > 0) {
              e.preventDefault();
              const dt = new DataTransfer();
              for (const f of files) dt.items.add(f);
              onAddFiles(dt.files);
            }
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (e.nativeEvent.isComposing) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            onSend();
          }}
          autoComplete="off"
          className={cn(
            "max-h-[120px] min-h-[44px] w-full resize-none appearance-none border-0",
            "bg-transparent px-3.5 py-2.5 text-[13px] leading-snug text-ds-text-1",
            "placeholder:text-ds-text-4 shadow-none outline-none",
            /* Anula el :focus-visible global (ring + ring-offset) que pinta
               un rectángulo claro sobre el vidrio del sheet. */
            "focus:outline-none focus:ring-0 focus:ring-offset-0",
            "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
          )}
        />
        <div className="flex h-[38px] items-center gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={sending || staging || pendingFiles.length >= 4}
            aria-label="Adjuntar archivo"
            title="Adjuntar imagen, PDF, Excel o Word (máx. 10MB)"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1 disabled:opacity-40"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          {dictationSupported ? (
            <button
              type="button"
              onClick={onToggleDictation}
              disabled={sending || staging}
              aria-label="Dictar"
              title="Dictar por voz"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ds-text-3 hover:bg-ds-surface-3 hover:text-ds-text-1 disabled:opacity-40"
            >
              <Mic className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="button"
            role="switch"
            aria-checked={polishEnabled}
            title="Pulido IA: corrige puntuación del dictado (opcional)"
            onClick={() => onPolishChange(!polishEnabled)}
            className={cn(
              "inline-flex h-9 items-center gap-1 rounded-full px-2 text-[12px]",
              polishEnabled
                ? "bg-primary/15 text-primary"
                : "border border-ds-border-default text-ds-text-4 hover:bg-ds-surface-3",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Pulido
          </button>
          <span className="flex-1" />
          {sending ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Detener respuesta"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-status-danger text-white"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={staging || (!input.trim() && pendingFiles.length === 0)}
              aria-label="Enviar"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_24px_hsl(var(--primary)/0.35)] disabled:opacity-40"
            >
              {staging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
