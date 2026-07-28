"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, Minus, PenLine, X } from "lucide-react";
import { confirmDialog } from "@/components/ui/confirm-service";
import { cn } from "@/lib/utils";
import { EmailComposer } from "./EmailComposer";

type Props = {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
};

type WindowState = "normal" | "minimized" | "expanded";

/**
 * Composición nueva desde la bandeja: fullscreen opaco en móvil (sin Liquid
 * Glass — el vidrio dejaba leer la bandeja detrás) y ventana tipo Gmail en
 * desktop (minimizar / expandir / cerrar). Cerrar con cambios pide
 * confirmación — el autosave a Drafts ya protege el trabajo.
 */
export function CorreoComposeSheet({ open, onClose, onSent }: Props) {
  const [dirty, setDirty] = useState(false);
  const [win, setWin] = useState<WindowState>("normal");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setWin("normal");
    else setDirty(false);
  }, [open]);

  if (!open || !mounted) return null;

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

  const panel = (
    <div
      role="dialog"
      aria-modal={win !== "minimized"}
      aria-label="Mensaje nuevo"
      className={cn(
        // Opaco siempre: overlays de redacción no usan Liquid Glass.
        "flex flex-col overflow-hidden border border-ds-border-default bg-background text-ds-text-1 shadow-2xl",
        // Móvil: fullscreen.
        "fixed inset-0 z-[60] rounded-none",
        // Desktop: dock abajo-derecha (Gmail).
        "md:inset-auto md:bottom-0 md:right-4 md:z-[60]",
        win === "minimized" &&
          "md:h-12 md:w-[min(420px,calc(100vw-2rem))] md:rounded-t-xl md:border-b-0",
        win === "normal" &&
          "md:h-[min(640px,calc(100dvh-5rem))] md:w-[min(720px,calc(100vw-2rem))] md:rounded-t-2xl",
        win === "expanded" &&
          "md:bottom-4 md:right-4 md:top-16 md:h-auto md:w-[min(960px,calc(100vw-2rem))] md:rounded-2xl",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 border-b border-ds-border-subtle px-3",
          "bg-ds-surface-2",
          "pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] md:pt-0",
          win === "minimized" ? "h-12" : "h-12 md:h-11",
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left ds-tap"
          onClick={() => {
            if (win === "minimized") setWin("normal");
          }}
          aria-label={win === "minimized" ? "Restaurar mensaje nuevo" : undefined}
        >
          <PenLine className="h-4 w-4 shrink-0 text-ds-text-3" />
          <p className="truncate text-sm font-medium text-ds-text-1">Mensaje nuevo</p>
        </button>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            aria-label={win === "minimized" ? "Restaurar" : "Minimizar"}
            title={win === "minimized" ? "Restaurar" : "Minimizar"}
            onClick={() => setWin((w) => (w === "minimized" ? "normal" : "minimized"))}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 md:inline-flex md:h-9 md:w-9"
          >
            {win === "minimized" ? <Maximize2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label={win === "expanded" ? "Restaurar tamaño" : "Expandir"}
            title={win === "expanded" ? "Restaurar tamaño" : "Expandir"}
            onClick={() =>
              setWin((w) => (w === "expanded" ? "normal" : "expanded"))
            }
            className="hidden h-10 w-10 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 md:inline-flex md:h-9 md:w-9"
          >
            {win === "expanded" ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={confirmClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ds-text-3 ds-tap hover:bg-ds-surface-3 hover:text-ds-text-1 md:h-9 md:w-9"
          >
            <X className="h-5 w-5 md:h-4 md:w-4" />
          </button>
        </div>
      </div>

      {win !== "minimized" && (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-1">
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
      )}
    </div>
  );

  return createPortal(
    <>
      {/* Móvil: backdrop opaco de cierre. Desktop: solo al expandir. */}
      {win !== "minimized" && (
        <div
          className={cn(
            "fixed inset-0 z-[59] bg-black/50",
            win === "normal" && "md:pointer-events-none md:bg-transparent",
            win === "expanded" && "md:bg-black/40",
          )}
          onClick={win === "expanded" ? () => setWin("normal") : confirmClose}
          aria-hidden
        />
      )}
      {panel}
    </>,
    document.body,
  );
}
