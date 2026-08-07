"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, LayoutGrid, X } from "lucide-react";
import { hasModuleAccess } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { useSwipeGesture } from "@/components/chat/hooks/useSwipeGesture";
import { CorreoTasksPanel } from "./CorreoTasksPanel";
import { CorreoTicketPanel } from "./CorreoTicketPanel";
import { CorreoMeetingPanel } from "./CorreoMeetingPanel";
import { CorreoWorkSummary } from "./CorreoWorkSummary";
import { CorreoAttachments } from "./CorreoAttachments";
import {
  CORREO_DOCK_WIDTH,
  COPILOT_DOCK_DESKTOP_MQ,
  DOCK_CLAIM_COPILOT,
  claimDockWidth,
  isCopilotDockDesktop,
  releaseDockWidth,
  useCopilotDockDesktop,
} from "./correo-copilot-dock";
import { cn } from "@/lib/utils";
import { WORK_TABS, resolveWorkTab, type WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import type { CorreoAiCommandId } from "@/modules/crm/email/correo-ai-commands";
import type { CorreoCascadeAiTarget } from "@/modules/crm/email/correo-cascade-ai";

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab: WorkTab;
  detail: CorreoDetail;
  readCursorAt?: string | null;
  workTabIntent?: { tab: WorkTab; nonce: number } | null;
  onOpenAiLead: () => void;
  onAiCommand?: (commandId: CorreoAiCommandId) => void;
  onCreateWithAi?: (target: CorreoCascadeAiTarget) => void;
  onAssociate: (p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }) => void | Promise<void>;
  onRefresh: () => void;
  onRequestReply?: () => void;
};

/**
 * Copiloto v4: 2 pestañas (Contexto / Trabajo). En desktop es un dock
 * persistente (sin scrim) para poder seguir navegando la bandeja; en mobile
 * sigue siendo bottom-sheet con backdrop.
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
  onCreateWithAi,
  onAssociate,
  onRefresh,
  onRequestReply,
}: Props) {
  const resolvedInitial = resolveWorkTab(initialTab);
  const [tab, setTab] = useState(() => resolvedInitial);
  const [closing, setClosing] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const dockDesktop = useCopilotDockDesktop();
  const perms = useEffectivePermissions();
  const threadId = detail.thread.id;

  useEffect(() => {
    if (!open) return;
    setTab(resolveWorkTab(initialTab));
    setClosing(false);
    setAttachmentsOpen(false);
  }, [open, initialTab, threadId]);

  useEffect(() => {
    if (!open || !workTabIntent) return;
    setTab(resolveWorkTab(workTabIntent.tab));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workTabIntent?.nonce, open]);

  // Dock desktop: reserva espacio en el layout (mismo carril que Plan de acciones).
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) {
      releaseDockWidth(DOCK_CLAIM_COPILOT);
      return;
    }
    const apply = () => {
      if (isCopilotDockDesktop()) claimDockWidth(DOCK_CLAIM_COPILOT, CORREO_DOCK_WIDTH);
      else releaseDockWidth(DOCK_CLAIM_COPILOT);
    };
    apply();
    const mq = window.matchMedia(COPILOT_DOCK_DESKTOP_MQ);
    mq.addEventListener("change", apply);
    return () => {
      mq.removeEventListener("change", apply);
      releaseDockWidth(DOCK_CLAIM_COPILOT);
    };
  }, [open]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    const el = sheetRef.current;
    if (el && typeof window !== "undefined" && !dockDesktop) {
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
      e.stopPropagation();
      if (attachmentsOpen) {
        setAttachmentsOpen(false);
        return;
      }
      requestClose();
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, closing, onClose, attachmentsOpen]);

  if (!open) return null;

  const t = detail.thread;
  const modChips = [
    { label: "Productividad", on: true },
    { label: "Comercial", on: hasModuleAccess(perms, "crm") },
    { label: "Operaciones", on: hasModuleAccess(perms, "ops") },
  ].filter((m) => m.on);

  function selectTab(next: WorkTab) {
    setTab(resolveWorkTab(next));
  }

  return createPortal(
    <>
      {/* Scrim en sheet (móvil / iPad). En desktop fino el dock no bloquea la bandeja. */}
      {!dockDesktop ? (
        <div
          className="fixed inset-0 z-[54] bg-black/40"
          onClick={requestClose}
          aria-hidden
        />
      ) : null}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal={dockDesktop ? "false" : "true"}
        aria-label="Copiloto"
        className={cn(
          "fixed z-[55] flex flex-col overflow-hidden border-ds-border-default bg-ds-surface-1",
          dockDesktop
            ? "top-0 right-0 h-full w-[min(430px,calc(100vw-2rem))] border-l shadow-[-8px_0_30px_-12px_rgba(0,0,0,0.25)]"
            : "inset-x-0 bottom-0 mt-auto h-[90dvh] max-h-[90dvh] w-full rounded-t-2xl border-t shadow-2xl",
        )}
        style={
          closing
            ? { transition: "transform 180ms ease-out" }
            : undefined
        }
      >
        {!dockDesktop ? (
          <button
            type="button"
            className="mx-auto mt-2 flex h-11 w-16 shrink-0 items-center justify-center"
            aria-label="Cerrar panel"
            onClick={requestClose}
            onTouchStart={swipe.onTouchStart}
            onTouchMove={swipe.onTouchMove}
            onTouchEnd={swipe.onTouchEnd}
          >
            <span className="h-1 w-10 rounded-full bg-ds-surface-3" aria-hidden />
          </button>
        ) : null}
        <header
          className="shrink-0 border-b border-ds-border-subtle px-3 py-2.5"
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 shrink-0 text-tint-violet-fg" />
            <p className="font-display text-[15px] font-semibold text-ds-text-1">Copiloto</p>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={requestClose}
              className="ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-3 sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
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
        </header>

        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          {attachmentsOpen ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setAttachmentsOpen(false)}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-3 sm:h-9 sm:w-9"
                  aria-label="Volver al contexto"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1 pt-1">
                  <h2 className="font-display text-[15px] font-semibold text-ds-text-1">
                    Adjuntos del hilo
                  </h2>
                  <p className="text-[12px] text-ds-text-3">
                    {detail.attachments.length === 0
                      ? "Este hilo no tiene adjuntos"
                      : `${detail.attachments.length} archivo${detail.attachments.length === 1 ? "" : "s"} · guardá o quitá de OPAI`}
                  </p>
                </div>
              </div>
              {detail.attachments.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-ds-text-3">Sin adjuntos</p>
              ) : (
                <CorreoAttachments
                  items={detail.attachments}
                  threadId={t.id}
                  dealId={t.dealId}
                  dealTitle={t.dealTitle}
                  accountId={t.accountId}
                  accountName={t.accountName}
                  degraded={detail.degraded}
                  onSaved={onRefresh}
                  onRequestAssociate={() => {
                    setAttachmentsOpen(false);
                    selectTab("contexto");
                  }}
                  defaultOpen
                  hideCollapseHeader
                  savePlacement="inline"
                />
              )}
            </div>
          ) : (
            <>
              {tab === "contexto" && (
                <CorreoWorkSummary
                  detail={detail}
                  readCursorAt={readCursorAt}
                  onOpenAiLead={onOpenAiLead}
                  onAiCommand={onAiCommand}
                  onCreateWithAi={onCreateWithAi}
                  onGoTo={(next) => selectTab(resolveWorkTab(next))}
                  onRequestReply={onRequestReply}
                  onOpenAttachments={() => setAttachmentsOpen(true)}
                  onClose={requestClose}
                  onAssociate={onAssociate}
                />
              )}
              {tab === "trabajo" && (
                <>
                  <CorreoMeetingPanel threadId={t.id} subject={t.subject} />
                  <CorreoTicketPanel threadId={t.id} subject={t.subject} />
                  <CorreoTasksPanel threadId={t.id} subject={t.subject} />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
