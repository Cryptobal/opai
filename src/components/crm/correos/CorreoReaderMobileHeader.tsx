"use client";

import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatSnoozeWhenShort } from "@/modules/crm/email/correo-snooze-presets";
import { useCorreoReaderScroll } from "./CorreoReaderScrollContext";

type Props = {
  subject: string;
  messageCount: number;
  accountName: string | null;
  dealTitle: string | null;
  snoozedUntil: string | null;
  onClose: () => void;
  /** Slot del menú "⋯" (Más acciones). */
  moreSlot?: ReactNode;
  /** Pager opcional (anterior / siguiente hilo). */
  pager?: ReactNode;
};

/**
 * Header adaptativo del lector móvil (`<lg`). En reposo: transparente sobre el
 * contenido, con Volver · línea de contexto · `⋯`. Al scrollear (`scrolled`):
 * material glass-strong + hairline y el asunto en una línea. Reemplaza el
 * header opaco de altura fija que truncaba el asunto.
 */
export function CorreoReaderMobileHeader({
  subject,
  messageCount,
  accountName,
  dealTitle,
  snoozedUntil,
  onClose,
  moreSlot,
  pager,
}: Props) {
  const { scrolled } = useCorreoReaderScroll();
  const snoozeActive =
    snoozedUntil != null && new Date(snoozedUntil).getTime() > Date.now();

  return (
    <header
      className={cn(
        "sticky top-0 z-20 shrink-0 px-2 pt-[calc(env(safe-area-inset-top)+0.375rem)] lg:hidden",
        "transition-[background-color,border-color,backdrop-filter] duration-200 [transition-timing-function:cubic-bezier(.22,1,.36,1)] motion-reduce:transition-none",
        scrolled
          ? "opai-glass-strong rounded-none border-0 border-b border-ds-border-subtle"
          : "border-0 border-b border-transparent bg-transparent",
      )}
    >
      <div className="flex h-[46px] items-center gap-1">
        <button
          type="button"
          onClick={onClose}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ds-text-2 ds-tap"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>

        <div className="min-w-0 flex-1 px-1 text-center">
          {scrolled ? (
            <p className="truncate font-display text-[12.5px] font-semibold text-ds-text-1">
              {subject || "(sin asunto)"}
            </p>
          ) : snoozeActive && snoozedUntil ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[12px] text-status-warn-fg">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-warn" aria-hidden />
              <span className="truncate">
                Pospuesto · {formatSnoozeWhenShort(new Date(snoozedUntil))}
              </span>
            </span>
          ) : accountName ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 text-[12px] text-ds-text-2">
              <span className="truncate">
                {[accountName, dealTitle].filter(Boolean).join(" › ")}
              </span>
            </span>
          ) : (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-[12px] text-ds-text-3">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ds-text-4/60" aria-hidden />
              <span className="truncate">
                {messageCount > 0
                  ? `${messageCount} ${messageCount === 1 ? "mensaje" : "mensajes"} · sin cuenta`
                  : "Sin cuenta"}
              </span>
            </span>
          )}
        </div>

        {pager}
        {moreSlot ?? <span className="h-11 w-11 shrink-0" aria-hidden />}
      </div>
    </header>
  );
}
