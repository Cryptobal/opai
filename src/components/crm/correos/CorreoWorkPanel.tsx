"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Briefcase, X } from "lucide-react";
import { hasModuleAccess } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { useSwipeGesture } from "@/components/chat/hooks/useSwipeGesture";
import { CorreoAssociationBar } from "./CorreoAssociationBar";
import { CorreoLinksPanel } from "./CorreoLinksPanel";
import { CorreoTasksPanel } from "./CorreoTasksPanel";
import { CorreoContactPanel } from "./CorreoContactPanel";
import { CorreoTicketPanel } from "./CorreoTicketPanel";
import { CorreoMeetingPanel } from "./CorreoMeetingPanel";
import { CorreoWorkSummary } from "./CorreoWorkSummary";
import { WORK_TABS, resolveWorkTab, type WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoAiCommandId } from "@/modules/crm/email/correo-ai-commands";

type Detent = "peek" | "full";

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab: WorkTab;
  detail: CorreoDetail;
  readCursorAt?: string | null;
  workTabIntent?: { tab: WorkTab; nonce: number } | null;
  onOpenAiLead: () => void;
  onAiCommand?: (commandId: CorreoAiCommandId) => void;
  onAssociate: (p: { accountId: string | null; dealId: string | null; sharedWithAccount?: boolean }) => void;
  onRefresh: () => void;
  onRequestReply?: () => void;
};

function initialDetent(tab: WorkTab): Detent {
  return tab === "resumen" ? "peek" : "full";
}

/**
 * Panel de trabajo transversal: slide-over derecha en desktop /
 * bottom-sheet en móvil con dos alturas (peek 52dvh / full 90dvh).
 */
export function CorreoWorkPanel({
  open,
  onClose,
  initialTab,
  detail,
  readCursorAt = null,
  workTabIntent = null,
  onOpenAiLead,
  onAiCommand,
  onAssociate,
  onRefresh,
  onRequestReply,
}: Props) {
  const resolvedInitial = resolveWorkTab(initialTab);
  const [tab, setTab] = useState(() => resolvedInitial);
  const [detent, setDetent] = useState<Detent>(() => initialDetent(resolvedInitial));
  const [closing, setClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const perms = useEffectivePermissions();
  const threadId = detail.thread.id;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!open) return;
    const next = resolveWorkTab(initialTab);
    setTab(next);
    setDetent(initialDetent(next));
    setClosing(false);
  }, [open, initialTab, threadId]);

  useEffect(() => {
    if (!open || !workTabIntent) return;
    setTab(resolveWorkTab(workTabIntent.tab));
    setDetent("full");
    // nonce fuerza re-apertura aunque sea la misma pestaña.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTabIntent?.nonce, open]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    const el = sheetRef.current;
    if (el && typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      el.style.transition = "transform 180ms ease-out";
      el.style.transform = "translate3d(0, 110%, 0)";
      window.setTimeout(() => onClose(), 180);
    } else {
      onClose();
    }
  };

  const onSwipeDown = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      requestClose();
      return;
    }
    if (detent === "full") {
      setDetent("peek");
      return;
    }
    requestClose();
  };

  const onSwipeUp = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      return;
    }
    if (detent === "peek") setDetent("full");
  };

  const swipe = useSwipeGesture({
    onSwipeDown,
    onSwipeUp,
    followFinger: true,
    targetRef: sheetRef,
    mobileOnly: true,
    hapticOnComplete: true,
    directionLock: true,
  });

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        requestClose();
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
    // requestClose closes over `closing`; re-bind when open/closing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing, onClose, detent]);

  if (!open) return null;

  const t = detail.thread;
  // peek solo aplica bajo lg; en desktop el slide-over siempre es "completo".
  const peekMode = isMobile && detent === "peek";
  const modChips = [
    { label: "Productividad", on: true },
    { label: "Comercial", on: hasModuleAccess(perms, "crm") },
    { label: "Operaciones", on: hasModuleAccess(perms, "ops") },
  ].filter((m) => m.on);

  function selectTab(next: WorkTab) {
    setTab(resolveWorkTab(next));
    if (detent === "peek") setDetent("full");
  }

  const sheetHeightStyle: CSSProperties = {
    ["--sheet-h" as string]: detent === "full" ? "90dvh" : "52dvh",
    transition: closing
      ? "transform 180ms ease-out"
      : "height 260ms ease, max-height 260ms ease",
  };

  return createPortal(
    <div
      className={
        peekMode
          ? "fixed inset-0 z-[55] flex justify-end pointer-events-none max-lg:items-end lg:pointer-events-auto lg:bg-black/40"
          : "fixed inset-0 z-[55] flex justify-end bg-black/40 max-lg:items-end"
      }
      onClick={(e) => {
        if (peekMode) return;
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={!peekMode}
        aria-label="Panel de trabajo"
        className="pointer-events-auto flex h-full w-full flex-col overflow-hidden border-ds-border-default bg-ds-surface-1 shadow-2xl sm:w-[430px] sm:border-l max-lg:mt-auto max-lg:h-[var(--sheet-h)] max-lg:max-h-[var(--sheet-h)] max-lg:rounded-t-2xl max-lg:border-t motion-reduce:transition-none"
        style={sheetHeightStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="mx-auto mt-2 flex h-11 w-16 shrink-0 items-center justify-center lg:hidden"
          aria-label={detent === "peek" ? "Expandir panel" : "Contraer panel"}
          onClick={() => setDetent((d) => (d === "peek" ? "full" : "peek"))}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <span className="h-1 w-10 rounded-full bg-ds-surface-3" aria-hidden />
        </button>
        <header
          className="shrink-0 border-b border-ds-border-subtle px-3 py-2.5"
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 shrink-0 text-tint-violet-fg" />
            <p className="font-display text-[15px] font-semibold text-ds-text-1">Panel de trabajo</p>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={requestClose}
              className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-3 sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {!peekMode && (
            <>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {modChips.map((m) => (
                  <span
                    key={m.label}
                    className="rounded-full bg-ds-surface-3 px-2 py-0.5 text-[12px] text-ds-text-3"
                  >
                    {m.label}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-1">
                {WORK_TABS.map((wt) => {
                  const Icon = wt.icon;
                  const active = tab === wt.id;
                  return (
                    <button
                      key={wt.id}
                      type="button"
                      onClick={() => selectTab(wt.id)}
                      aria-pressed={active}
                      className={`flex min-h-11 min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 ds-tap sm:min-h-0 ${
                        active ? "bg-primary/10 text-primary" : "text-ds-text-3"
                      }`}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" />
                      <span className="max-w-full truncate text-[12px] font-medium leading-none">
                        {wt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </header>

        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          {tab === "resumen" && (
            <CorreoWorkSummary
              detail={detail}
              readCursorAt={readCursorAt}
              peekMode={peekMode}
              onOpenAiLead={onOpenAiLead}
              onAiCommand={onAiCommand}
              onGoTo={(next) => selectTab(resolveWorkTab(next))}
              onRequestReply={onRequestReply}
            />
          )}
          {tab === "cuenta" && (
            <>
              <CorreoAssociationBar
                threadId={t.id}
                accountId={t.accountId}
                accountName={t.accountName}
                dealId={t.dealId}
                dealTitle={t.dealTitle}
                subject={t.subject}
                sharedWithAccount={t.sharedWithAccount}
                onAssociate={onAssociate}
              />
              <CorreoContactPanel threadId={t.id} />
            </>
          )}
          {tab === "vinculos" && <CorreoLinksPanel threadId={t.id} />}
          {tab === "productividad" && (
            <>
              <CorreoMeetingPanel threadId={t.id} subject={t.subject} />
              <CorreoTicketPanel threadId={t.id} subject={t.subject} />
              <CorreoTasksPanel threadId={t.id} subject={t.subject} />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
