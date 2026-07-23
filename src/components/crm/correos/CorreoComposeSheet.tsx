"use client";

import { PenLine, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { EmailComposer } from "./EmailComposer";

type Props = {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
};

/**
 * Sheet de composición nueva desde la bandeja (C13 — botón "Redactar").
 * Monta el composer unificado en modo "new": identidad con aliases,
 * autosave a Drafts, outbox con deshacer/programar.
 */
export function CorreoComposeSheet({ open, onClose, onSent }: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 md:items-center"
      onClick={onClose}
    >
      <Surface
        elevation={2}
        padding="md"
        className="max-h-[92dvh] w-full space-y-3 overflow-y-auto rounded-b-none rounded-t-2xl md:max-w-2xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-tint-violet-fg" />
            <p className="font-display text-sm font-semibold text-ds-text-1">Redactar correo</p>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} className="text-ds-text-3 ds-tap">
            <X className="h-4 w-4" />
          </button>
        </div>
        <EmailComposer mode="new" onSent={onSent} onClose={onClose} />
      </Surface>
    </div>
  );
}
