"use client";

import { useEffect, useState } from "react";
import { PenLine, WandSparkles, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { CorreoAiStyleForm } from "./CorreoAiStyleForm";
import { SignaturePanel } from "./signature/SignaturePanel";

type Tab = "ai" | "firma";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pestaña inicial al abrir (default: estilo IA). */
  initialTab?: Tab;
};

/**
 * Sheet de preferencias de Correos: Estilo IA + Firma.
 * Mantiene el nombre y props exportados para no tocar los call sites.
 */
export function CorreoAiStyleSheet({ open, onClose, initialTab = "ai" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  if (!open) return null;

  const wide = tab === "firma";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
      data-correo-scope
    >
      <Surface
        elevation={2}
        padding="md"
        className={`max-h-[90dvh] w-full space-y-3 overflow-y-auto rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] md:rounded-2xl ${
          wide ? "md:max-w-3xl" : "md:max-w-md"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-ds-surface-3 md:hidden" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tab === "ai" ? (
              <WandSparkles className="h-4 w-4 text-tint-violet-fg" />
            ) : (
              <PenLine className="h-4 w-4 text-primary" />
            )}
            <p className="font-display text-sm font-semibold text-ds-text-1">
              Preferencias de Correos
            </p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-ds-text-3 ds-tap">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="inline-flex w-full rounded-xl border border-ds-border-subtle bg-ds-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setTab("ai")}
            className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-ds-body ds-tap ${
              tab === "ai"
                ? "bg-ds-surface-1 font-medium text-ds-text-1 shadow-sm"
                : "text-ds-text-3"
            }`}
          >
            <WandSparkles className="h-3.5 w-3.5" />
            Estilo IA
          </button>
          <button
            type="button"
            onClick={() => setTab("firma")}
            className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-ds-body ds-tap ${
              tab === "firma"
                ? "bg-ds-surface-1 font-medium text-ds-text-1 shadow-sm"
                : "text-ds-text-3"
            }`}
          >
            <PenLine className="h-3.5 w-3.5" />
            Firma
          </button>
        </div>

        {tab === "ai" ? (
          <div className="space-y-3">
            <CorreoAiStyleForm active={open && tab === "ai"} />
          </div>
        ) : (
          <SignaturePanel defaultScope="user" />
        )}
      </Surface>
    </div>
  );
}
