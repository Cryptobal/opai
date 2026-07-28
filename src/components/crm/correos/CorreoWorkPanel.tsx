"use client";

import { useEffect, useRef, useState } from "react";
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

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab: WorkTab;
  detail: CorreoDetail;
  onOpenAiLead: () => void;
  onOpenAiAnalizar?: () => void;
  onAssociate: (p: { accountId: string | null; dealId: string | null; sharedWithAccount?: boolean }) => void;
  onRefresh: () => void;
};

/**
 * Panel de trabajo transversal: slide-over derecha en desktop /
 * bottom-sheet en móvil. Cuatro pestañas: Copiloto · Cuenta · Vínculos · Trabajo.
 */
export function CorreoWorkPanel({
  open, onClose, initialTab, detail, onOpenAiLead, onOpenAiAnalizar, onAssociate, onRefresh,
}: Props) {
  const [tab, setTab] = useState(() => resolveWorkTab(initialTab));
  const [closing, setClosing] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const perms = useEffectivePermissions();

  useEffect(() => {
    if (open) {
      setTab(resolveWorkTab(initialTab));
      setClosing(false);
    }
  }, [open, initialTab]);

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
  }, [open, closing, onClose]);

  if (!open) return null;

  const t = detail.thread;
  const modChips = [
    { label: "Productividad", on: true },
    { label: "Comercial", on: hasModuleAccess(perms, "crm") },
    { label: "Operaciones", on: hasModuleAccess(perms, "ops") },
  ].filter((m) => m.on);

  return createPortal(
    <div
      className="fixed inset-0 z-[55] flex justify-end bg-black/40"
      onClick={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Panel de trabajo"
        className="flex h-full w-full flex-col overflow-hidden border-ds-border-default bg-ds-surface-1 shadow-2xl sm:w-[430px] sm:border-l max-lg:mt-auto max-lg:h-[88dvh] max-lg:rounded-t-2xl max-lg:border-t"
        style={{ transition: closing ? "transform 180ms ease-out" : undefined }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ds-surface-3 lg:hidden"
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
          aria-hidden
        />
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
          <div className="mt-1.5 flex flex-wrap gap-1">
            {modChips.map((m) => (
              <span key={m.label} className="rounded-full bg-ds-surface-3 px-2 py-0.5 text-[12px] text-ds-text-3">
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
                  onClick={() => setTab(wt.id)}
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
          {tab === "resumen" && (
            <CorreoWorkSummary
              threadId={t.id}
              accountId={t.accountId}
              accountName={t.accountName}
              dealTitle={t.dealTitle}
              hasLead={Boolean(t.leadId)}
              attachmentCount={detail.attachments.length}
              attachmentsSaved={detail.attachments.filter((a) => a.savedFileId).length}
              onOpenAiLead={onOpenAiLead}
              onOpenAiAnalizar={onOpenAiAnalizar}
              onGoTo={(next) => setTab(resolveWorkTab(next))}
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
