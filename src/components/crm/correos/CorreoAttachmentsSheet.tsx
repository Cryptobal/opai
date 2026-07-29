"use client";

import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { CorreoAttachmentDTO } from "@/modules/crm/email/correos.types";
import { CorreoAttachments } from "./CorreoAttachments";
import { useCloseOnBack } from "./useCloseOnBack";

type Props = {
  open: boolean;
  onClose: () => void;
  threadId: string;
  items: CorreoAttachmentDTO[];
  dealId: string | null;
  dealTitle: string | null;
  accountId: string | null;
  accountName?: string | null;
  mailboxEmail?: string | null;
  degraded?: boolean;
  onSaved?: () => void;
  onRequestAssociate?: () => void;
};

/**
 * Hoja con los adjuntos del hilo (previsualización + guardar en cuenta/negocio).
 * Portal propio a `<body>` por encima del Copiloto (z-55): el Sheet Radix a
 * z-50 quedaba debajo / inert y el guardado no recibía clics.
 */
export function CorreoAttachmentsSheet({
  open,
  onClose,
  threadId,
  items,
  dealId,
  dealTitle,
  accountId,
  accountName,
  mailboxEmail,
  degraded,
  onSaved,
  onRequestAssociate,
}: Props) {
  useCloseOnBack(open, onClose);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-auto fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-end"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Adjuntos del hilo"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-ds-border-subtle bg-ds-surface-1 shadow-ds-lg"
      >
        <header className="flex shrink-0 items-start gap-2 border-b border-ds-border-subtle px-4 py-3">
          <div className="min-w-0 flex-1 text-left">
            <h2 className="font-display text-[16px] font-semibold text-ds-text-1">
              Adjuntos del hilo
            </h2>
            <p className="text-[12px] text-ds-text-3">
              {items.length === 0
                ? "Este hilo no tiene adjuntos"
                : `${items.length} archivo${items.length === 1 ? "" : "s"} · previsualiza o guarda en la ficha`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ds-text-3 ds-tap sm:h-9 sm:w-9"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          {items.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-ds-text-3">Sin adjuntos</p>
          ) : (
            <CorreoAttachments
              items={items}
              threadId={threadId}
              dealId={dealId}
              dealTitle={dealTitle}
              accountId={accountId}
              accountName={accountName}
              mailboxEmail={mailboxEmail}
              degraded={degraded}
              onSaved={onSaved}
              onRequestAssociate={onRequestAssociate}
              defaultOpen
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
