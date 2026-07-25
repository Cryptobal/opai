"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Briefcase, X } from "lucide-react";
import { hasModuleAccess } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import { CorreoAssociationBar } from "./CorreoAssociationBar";
import { CorreoLinksPanel } from "./CorreoLinksPanel";
import { CorreoTasksPanel } from "./CorreoTasksPanel";
import { CorreoContactPanel } from "./CorreoContactPanel";
import { CorreoTicketPanel } from "./CorreoTicketPanel";
import { CorreoMeetingPanel } from "./CorreoMeetingPanel";
import { CorreoWorkSummary } from "./CorreoWorkSummary";
import { WORK_TABS, type WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  open: boolean;
  onClose: () => void;
  initialTab: WorkTab;
  detail: CorreoDetail;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  onAssociate: (p: { accountId: string | null; dealId: string | null; sharedWithAccount?: boolean }) => void;
  onRefresh: () => void;
};

/**
 * Panel de trabajo transversal (Bloque 4): slide-over derecha en desktop /
 * bottom-sheet en móvil. Visible para todo usuario con Productividad; los chips
 * de módulo y las acciones se muestran por unión (gating client) y cada acción
 * valida su módulo server-side. Tabs: Resumen · Cuenta · Vínculos ·
 * Productividad · Reunión · Contacto.
 */
export function CorreoWorkPanel({ open, onClose, initialTab, detail, aiOpen, setAiOpen, onAssociate, onRefresh }: Props) {
  const [tab, setTab] = useState<WorkTab>(initialTab);
  const perms = useEffectivePermissions();

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [open, onClose]);

  if (!open) return null;

  const t = detail.thread;
  const modChips = [
    { label: "Productividad", on: true },
    { label: "Comercial", on: hasModuleAccess(perms, "crm") },
    { label: "Operaciones", on: hasModuleAccess(perms, "ops") },
  ].filter((m) => m.on);

  return createPortal(
    <div className="fixed inset-0 z-[55] flex justify-end bg-black/40" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Panel de trabajo"
        className="flex h-full w-full flex-col overflow-hidden border-ds-border-default bg-ds-surface-1 shadow-2xl sm:w-[430px] sm:border-l max-lg:mt-auto max-lg:h-[88dvh] max-lg:rounded-t-2xl max-lg:border-t"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle móvil */}
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ds-surface-3 lg:hidden" />
        <header className="shrink-0 border-b border-ds-border-subtle px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 shrink-0 text-tint-violet-fg" />
            <p className="font-display text-[15px] font-semibold text-ds-text-1">Panel de trabajo</p>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClose}
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-ds-text-3 ds-tap hover:bg-ds-surface-3"
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
          <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {WORK_TABS.map((wt) => (
              <button
                key={wt.id}
                type="button"
                onClick={() => setTab(wt.id)}
                aria-pressed={tab === wt.id}
                className={`h-8 shrink-0 rounded-full px-3 text-[12px] font-medium ds-tap ${
                  tab === wt.id ? "bg-primary text-primary-foreground" : "bg-ds-surface-2 text-ds-text-2"
                }`}
              >
                {wt.label}
              </button>
            ))}
          </div>
        </header>

        <div
          className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 [overscroll-behavior:contain]"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
        >
          {tab === "resumen" && (
            <CorreoWorkSummary
              threadId={t.id}
              accountId={t.accountId}
              hasLead={Boolean(t.leadId)}
              aiOpen={aiOpen}
              setAiOpen={setAiOpen}
              onRefresh={onRefresh}
              onGoTo={setTab}
            />
          )}
          {tab === "cuenta" && (
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
          )}
          {tab === "vinculos" && <CorreoLinksPanel threadId={t.id} />}
          {tab === "productividad" && (
            <>
              <CorreoTicketPanel threadId={t.id} subject={t.subject} />
              <CorreoTasksPanel threadId={t.id} subject={t.subject} />
            </>
          )}
          {tab === "reunion" && <CorreoMeetingPanel threadId={t.id} subject={t.subject} />}
          {tab === "contacto" && <CorreoContactPanel threadId={t.id} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
