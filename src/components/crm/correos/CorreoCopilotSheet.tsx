"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, WandSparkles, X } from "lucide-react";
import { Surface } from "@/components/opai-ds";
import { toast } from "sonner";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";
import { copilotoAttentionReasons } from "./correo-copiloto-reasons";
import { useCorreoSuggestedAccounts } from "./useCorreoSuggestedAccounts";
import { CorreoCopilotPending } from "./CorreoCopilotPending";

type Props = {
  open: boolean;
  detail: CorreoDetail;
  canEdit: boolean;
  onClose: () => void;
  onAssociate: (accountId: string) => void | Promise<void>;
  onOpenPanel: () => void;
  onComposeAi: () => void;
};

/** Sheet Copiloto móvil: pendientes + IA. Sustituye el banner violeta. */
export function CorreoCopilotSheet({
  open, detail, canEdit, onClose, onAssociate, onOpenPanel, onComposeAi,
}: Props) {
  const t = detail.thread;
  const reasons = copilotoAttentionReasons(detail);
  const suggestions = useCorreoSuggestedAccounts(t.id, open && t.accountId == null);
  const pendingAtt = detail.attachments.filter((a) => !a.savedFileId).length;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Portal a <body>: el lector aplica `animate-in`/`transform` + overflow, y un
  // `fixed` inline queda anclado al panel (sheet “pegado” a media altura sin
  // scroll). Mismo patrón que CorreoWorkPanel / CorreoAiMenuSheet.
  if (!mounted || !open) return null;

  async function associate(id: string) {
    if (busyId) return;
    setBusyId(id);
    try { await onAssociate(id); } finally { setBusyId(null); }
  }

  async function summarize() {
    if (summarizing) return;
    setSummarizing(true);
    try {
      const res = await fetch(`/api/crm/correos/${t.id}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "full" }),
      });
      const data = (await res.json().catch(() => ({}))) as { summary?: string; error?: string };
      if (!res.ok || !data.summary) {
        toast.error(data.error || "No se pudo resumir el hilo");
        return;
      }
      toast.success(data.summary.length > 180 ? `${data.summary.slice(0, 180)}…` : data.summary);
      onClose();
    } catch {
      toast.error("No se pudo resumir el hilo");
    } finally {
      setSummarizing(false);
    }
  }

  const openCtx = () => { onClose(); onOpenPanel(); };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 lg:hidden"
      onClick={onClose}
      role="presentation"
    >
      <Surface
        elevation={2}
        padding="md"
        role="dialog"
        aria-label="Copiloto"
        aria-modal="true"
        className="flex w-full max-h-[85dvh] flex-col rounded-b-none rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+1rem)] motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto h-1 w-10 shrink-0 rounded-full bg-ds-surface-3" />
        <div className="flex shrink-0 items-center justify-between gap-2 pt-1">
          <p className="inline-flex items-center gap-1.5 font-display text-sm font-semibold text-ds-text-1">
            <Sparkles className="h-4 w-4 text-tint-violet-fg" aria-hidden />
            Copiloto
            {reasons.length > 0 && (
              <span className="rounded-full bg-tint-violet/15 px-2 text-[12px] font-medium text-tint-violet-fg">
                {reasons.length}
              </span>
            )}
          </p>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-ds-text-3 ds-tap"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
          {reasons.length > 0 && (
            <CorreoCopilotPending
              noAccount={t.accountId == null}
              pendingAttachments={pendingAtt}
              degraded={detail.degraded}
              canEdit={canEdit}
              suggestions={suggestions}
              busyId={busyId}
              onAssociate={(id) => void associate(id)}
              onOpenPanel={openCtx}
            />
          )}

          <section className="space-y-1">
            <p className="text-[12px] font-medium uppercase tracking-wide text-ds-text-3">IA</p>
            <div className="overflow-hidden rounded-xl border border-ds-border-subtle bg-ds-surface-1">
              <button
                type="button"
                disabled={summarizing}
                onClick={() => void summarize()}
                className="flex min-h-12 w-full items-center gap-3 border-b border-ds-border-subtle px-3.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4 shrink-0 text-tint-violet-fg" aria-hidden />
                <span className="font-medium">{summarizing ? "Resumiendo…" : "Resumir hilo"}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onComposeAi();
                }}
                className="flex min-h-12 w-full items-center gap-3 px-3.5 text-left text-[13px] text-ds-text-1 ds-tap hover:bg-ds-surface-2"
              >
                <WandSparkles className="h-4 w-4 shrink-0 text-tint-violet-fg" aria-hidden />
                <span className="font-medium">Redactar respuesta con IA</span>
              </button>
            </div>
          </section>
        </div>
      </Surface>
    </div>,
    document.body,
  );
}
