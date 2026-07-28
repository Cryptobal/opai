"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { CorreoAttachmentDTO } from "@/modules/crm/email/correos.types";
import { CorreoAttachments } from "./CorreoAttachments";

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
 * Reutiliza CorreoAttachments / Viewer / Save — no inventa un visor nuevo.
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
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0 sm:max-w-lg sm:rounded-t-2xl"
      >
        <SheetHeader className="border-b border-ds-border-subtle px-4 py-3 text-left">
          <SheetTitle className="font-display text-[16px] text-ds-text-1">
            Adjuntos del hilo
          </SheetTitle>
          <SheetDescription className="text-[12px] text-ds-text-3">
            {items.length === 0
              ? "Este hilo no tiene adjuntos"
              : `${items.length} archivo${items.length === 1 ? "" : "s"} · previsualiza o guarda en la ficha`}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
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
      </SheetContent>
    </Sheet>
  );
}
