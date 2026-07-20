"use client";

import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { Surface, Tag, Spinner } from "@/components/opai-ds";
import { CorreoAssociationBar } from "./CorreoAssociationBar";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoAttachments } from "./CorreoAttachments";
import { LeadFromEmailPanel } from "./LeadFromEmailPanel";
import { SuggestedReplyPanel } from "./SuggestedReplyPanel";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  threadId: string | null;
  onClose: () => void;
  onChanged?: () => void;
  autoExtract?: boolean; // deep-link ?extract=1: abre el panel de extracción con IA
};

export function CorreoDrawer({ threadId, onClose, onChanged, autoExtract }: Props) {
  const [detail, setDetail] = useState<CorreoDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const load = useCallback(async () => {
    if (!threadId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/crm/correos/${threadId}`);
      setDetail(r.ok ? await r.json() : null);
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  useEffect(() => {
    setDetail(null);
    setAiOpen(false);
    void load();
  }, [load]);

  useEffect(() => {
    // ?extract=1: al cargar el hilo sin lead, abre el panel de IA.
    if (autoExtract && detail && !detail.thread.leadId) setAiOpen(true);
  }, [autoExtract, detail]);

  async function associate(accountId: string) {
    if (!threadId) return;
    await fetch(`/api/crm/correos/${threadId}/associate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    await load();
    onChanged?.();
  }

  if (!threadId) return null;
  const gmailUrl = detail?.thread.providerThreadId
    ? `https://mail.google.com/mail/u/0/#all/${detail.thread.providerThreadId}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <Surface
        elevation={2}
        padding="md"
        className="h-full w-full max-w-lg space-y-4 overflow-y-auto"
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-display text-base font-semibold text-ds-text-1">
            {detail?.thread.subject || "Correo"}
          </p>
          <button type="button" onClick={onClose} className="shrink-0 text-[13px] text-ds-text-3">
            Cerrar
          </button>
        </div>

        {loading && !detail ? (
          <Spinner className="mx-auto" />
        ) : !detail ? (
          <p className="text-[13px] text-ds-text-4">No se pudo cargar el hilo.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {detail.thread.accountId ? (
                <Tag variant="brand" size="sm">{detail.thread.accountName || "Cuenta"}</Tag>
              ) : (
                <Tag variant="neutral" size="sm">Sin asociar</Tag>
              )}
              {detail.thread.dealId && (
                <Tag variant="info" size="sm">Negocio · {detail.thread.dealTitle || "—"}</Tag>
              )}
              {gmailUrl && (
                <a
                  href={gmailUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary ds-tap"
                >
                  Abrir en Gmail <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <CorreoAssociationBar accountName={detail.thread.accountName} onSelect={associate} />

            {detail.thread.leadId ? (
              <div className="flex items-center gap-2 rounded-xl border border-status-ok-border bg-status-ok-soft p-2.5 text-[13px] text-status-ok-fg">
                <CheckCircle2 className="h-4 w-4" /> Lead creado desde este correo.
              </div>
            ) : aiOpen ? (
              <LeadFromEmailPanel
                threadId={detail.thread.id}
                hasAccount={Boolean(detail.thread.accountId)}
                onClose={() => setAiOpen(false)}
                onCreated={() => {
                  setAiOpen(false);
                  void load();
                  onChanged?.();
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap"
              >
                <Sparkles className="h-4 w-4" /> Crear lead con IA
              </button>
            )}

            <SuggestedReplyPanel
              threadId={detail.thread.id}
              subject={detail.thread.subject}
              onSent={() => { void load(); onChanged?.(); }}
            />

            <CorreoAttachments items={detail.attachments} />

            <CorreoMessages messages={detail.messages} />
          </>
        )}
      </Surface>
    </div>
  );
}
