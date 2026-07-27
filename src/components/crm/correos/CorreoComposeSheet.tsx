"use client";

import { useState } from "react";
import { PenLine, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { confirmDialog } from "@/components/ui/confirm-service";
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
    if (!dirty) {
      setDirty(false);
      onClose();
      return;
    }
    void confirmDialog({
      description: "¿Cerrar el composer? Tu borrador queda guardado en Borradores.",
    }).then((ok) => {
      if (ok) {
        setDirty(false);
        onClose();
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/40 md:items-end md:justify-end md:p-0 md:pb-0 md:pr-4 md:pt-16"
      onClick={confirmClose}
    >
      <Surface
        elevation={1}
        padding="none"
        className="flex h-dvh w-full flex-col overflow-hidden rounded-none border-0 bg-background md:h-[min(720px,calc(100dvh-5rem))] md:max-w-xl md:rounded-t-2xl md:shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5 pt-[calc(env(safe-area-inset-top,0px)+0.625rem)] md:pt-2.5">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-ds-text-3" />
            <p className="text-sm font-medium text-ds-text-1">Mensaje nuevo</p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={confirmClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-2"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
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
