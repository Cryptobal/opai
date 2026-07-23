"use client";

import { useState } from "react";
import { PenLine, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { EmailComposer } from "./EmailComposer";

type Props = {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
};

/**
 * Composición nueva desde la bandeja (C13 + C22b): fullscreen en móvil
 * (safe-areas, teclado sin tapar el editor: el contenido scrollea) y modal
 * centrado en desktop. Cerrar con cambios pide confirmación — aunque el
 * autosave a Drafts ya protege el trabajo.
 */
export function CorreoComposeSheet({ open, onClose, onSent }: Props) {
  const [dirty, setDirty] = useState(false);
  if (!open) return null;

  const confirmClose = () => {
    if (
      !dirty ||
      window.confirm("¿Cerrar el composer? Tu borrador queda guardado en Borradores.")
    ) {
      setDirty(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 md:items-center md:p-4"
      onClick={confirmClose}
    >
      <Surface
        elevation={2}
        padding="none"
        className="flex h-dvh w-full flex-col overflow-hidden rounded-none md:h-auto md:max-h-[92dvh] md:max-w-2xl md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-ds-border-subtle px-4 py-3 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)] md:pt-3">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-tint-violet-fg" />
            <p className="font-display text-sm font-semibold text-ds-text-1">Redactar correo</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={confirmClose}
            className="flex h-11 w-11 items-center justify-center text-ds-text-3 ds-tap"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <EmailComposer
            mode="new"
            onSent={onSent}
            onClose={() => {
              setDirty(false);
              onClose();
            }}
            onDirtyChange={setDirty}
          />
        </div>
      </Surface>
    </div>
  );
}
