"use client";

import { useEffect, useState } from "react";
import {
  Code2,
  Copy,
  ExternalLink,
  MoreHorizontal,
  PenLine,
  Printer,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";

type Props = {
  threadId: string;
  providerThreadId: string | null;
  onOpenSignature?: () => void;
  onOpenAiStyle?: () => void;
};

/**
 * Menú "⋯ Más acciones" del lector (Gmail · Imprimir · Ver original · Firma ·
 * Estilo · Copiar enlace). Compartido por la cabecera desktop y el header
 * adaptativo móvil, con su propio estado abierto/cerrado y scrim.
 */
export function CorreoReaderOverflowMenu({
  threadId,
  providerThreadId,
  onOpenSignature,
  onOpenAiStyle,
}: Props) {
  const [open, setOpen] = useState(false);
  const gmailUrl = providerThreadId
    ? `https://mail.google.com/mail/u/0/#all/${providerThreadId}`
    : null;

  useEffect(() => {
    setOpen(false);
  }, [threadId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function copyThreadLink() {
    setOpen(false);
    const url = `${window.location.origin}/crm/correos?thread=${encodeURIComponent(threadId)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace del hilo copiado");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  function printThread() {
    setOpen(false);
    window.print();
  }

  function viewOriginal() {
    setOpen(false);
    document
      .querySelector("[data-correo-message]")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.message("Desplazado al mensaje original");
  }

  const itemCls =
    "flex min-h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 sm:min-h-9";

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label="Más acciones"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ds-border-default bg-ds-surface-1 text-ds-text-2 ds-tap sm:h-8 sm:w-8"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          {/* Scrim transparente: captura el tap fuera y evita que el click
              sintetizado alcance elementos sticky debajo. */}
          <div
            aria-hidden
            className="fixed inset-0 z-[55]"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            role="menu"
            className="absolute right-0 z-[56] mt-1 w-52 overflow-hidden rounded-xl border border-ds-border-default bg-ds-surface-1 py-1 shadow-ds-lg"
          >
            {gmailUrl && (
              <a
                role="menuitem"
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={itemCls}
              >
                <ExternalLink className="h-4 w-4 text-ds-text-3" /> Abrir en Gmail
              </a>
            )}
            <button type="button" role="menuitem" onClick={printThread} className={itemCls}>
              <Printer className="h-4 w-4 text-ds-text-3" /> Imprimir
            </button>
            <button type="button" role="menuitem" onClick={viewOriginal} className={itemCls}>
              <Code2 className="h-4 w-4 text-ds-text-3" /> Ver original
            </button>
            {onOpenSignature && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onOpenSignature();
                }}
                className={itemCls}
              >
                <PenLine className="h-4 w-4 text-ds-text-3" /> Firma
              </button>
            )}
            {onOpenAiStyle && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onOpenAiStyle();
                }}
                className={itemCls}
              >
                <WandSparkles className="h-4 w-4 text-ds-text-3" /> Estilo de respuesta
              </button>
            )}
            <div className="my-1 border-t border-ds-border-subtle" role="separator" />
            <button
              type="button"
              role="menuitem"
              onClick={() => void copyThreadLink()}
              className={itemCls}
            >
              <Copy className="h-4 w-4 text-ds-text-3" /> Copiar enlace del hilo
            </button>
          </div>
        </>
      )}
    </div>
  );
}
