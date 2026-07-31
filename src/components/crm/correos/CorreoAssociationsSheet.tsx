"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useSwipeGesture } from "@/components/chat/hooks/useSwipeGesture";
import { CorreoContextCascade } from "./CorreoContextCascade";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoCascadeAiTarget } from "@/modules/crm/email/correo-cascade-ai";

type Props = {
  open: boolean;
  onClose: () => void;
  detail: CorreoDetail;
  onAssociate: (p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }) => void | Promise<void>;
  onCreateWithAi?: (target: CorreoCascadeAiTarget) => void;
};

/**
 * Bottom sheet "Asociaciones": cascada jerárquica indentada del hilo.
 * Reutiliza CorreoContextCascade (misma fuente que el Copiloto).
 */
export function CorreoAssociationsSheet({
  open,
  onClose,
  detail,
  onAssociate,
  onCreateWithAi,
}: Props) {
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setClosing(false);
  }, [open, detail.thread.id]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    const el = sheetRef.current;
    if (el) {
      el.style.transition = "transform 180ms ease-out";
      el.style.transform = "translate3d(0, 110%, 0)";
      window.setTimeout(() => onClose(), 180);
    } else {
      onClose();
    }
  };

  const swipe = useSwipeGesture({
    onSwipeDown: () => requestClose(),
    followFinger: true,
    targetRef: sheetRef,
    mobileOnly: true,
    hapticOnComplete: true,
    directionLock: true,
  });

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      requestClose();
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[54] bg-black/40 lg:hidden"
        onClick={requestClose}
        aria-hidden
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Asociaciones"
        className="fixed inset-x-0 bottom-0 z-[55] flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-t border-ds-border-default bg-ds-surface-1 shadow-2xl lg:hidden"
        style={closing ? { transition: "transform 180ms ease-out" } : undefined}
      >
        <button
          type="button"
          className="mx-auto mt-2 flex h-11 w-16 shrink-0 items-center justify-center"
          aria-label="Cerrar asociaciones"
          onClick={requestClose}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <span className="h-1 w-10 rounded-full bg-ds-surface-3" aria-hidden />
        </button>
        <header
          className="flex shrink-0 items-center gap-2 border-b border-ds-border-subtle px-3 pb-2.5"
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <p className="font-display text-[15px] font-semibold text-ds-text-1">Asociaciones</p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={requestClose}
            className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-3 sm:h-9 sm:w-9"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div
          className="min-h-0 flex-1 overflow-y-auto p-3 [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          <CorreoContextCascade
            detail={detail}
            onAssociate={onAssociate}
            onCreateWithAi={onCreateWithAi}
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
