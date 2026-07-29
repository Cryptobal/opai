"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { canEdit, hasCapability } from "@/lib/permissions";
import { useEffectivePermissions } from "@/hooks/useEffectivePermissions";
import {
  primaryActionCopy,
  resolveCorreoAiCommands,
  resolvePrimaryCorreoAiCommand,
  type CorreoAiCommandId,
} from "@/modules/crm/email/correo-ai-commands";
import { resolveContinueActions } from "@/modules/crm/email/correo-continue-actions";
import { CorreoThreadSummaryCard } from "./CorreoThreadSummaryCard";
import { CorreoContextCascade } from "./CorreoContextCascade";
import type { WorkTab } from "./work-panel-tabs";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  /** Cursor de lectura capturado al abrir (antes del markRead). */
  readCursorAt: string | null;
  onOpenAiLead: () => void;
  onAiCommand?: (commandId: CorreoAiCommandId) => void;
  onGoTo: (tab: WorkTab) => void;
  onRequestReply?: () => void;
  /** Abre la hoja de adjuntos del hilo (no navega a Vínculos). */
  onOpenAttachments?: () => void;
  onAssociate: (p: {
    accountId: string | null;
    dealId: string | null;
    sharedWithAccount?: boolean;
  }) => void | Promise<void>;
};

/**
 * Tab Copiloto (id `resumen`): veredicto completo, acción principal,
 * resumen del hilo con Continuar, más acciones IA y estado del hilo.
 */
export function CorreoWorkSummary({
  detail,
  readCursorAt,
  onOpenAiLead,
  onAiCommand,
  onGoTo,
  onRequestReply,
  onOpenAttachments,
  onAssociate,
}: Props) {
  const t = detail.thread;
  const perms = useEffectivePermissions();
  const canUseCopiloto = hasCapability(perms, "copiloto_correos");
  const canEditCorreos = canEdit(perms, "productividad", "correos");

  const primary = useMemo(
    () =>
      canUseCopiloto
        ? resolvePrimaryCorreoAiCommand(t.aiCategory, perms, { canEditCorreos })
        : null,
    [t.aiCategory, perms, canEditCorreos, canUseCopiloto],
  );
  const secondary = useMemo(() => {
    if (!canUseCopiloto) return [];
    const { primary: p, more } = resolveCorreoAiCommands(perms, {
      canEditCorreos,
    });
    return [...p, ...more].filter((c) => c.id !== primary?.id && c.kind === "panel");
  }, [perms, canEditCorreos, canUseCopiloto, primary?.id]);

  const [primaryExecuted, setPrimaryExecuted] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    setPrimaryExecuted(false);
    setMoreOpen(false);
  }, [t.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const primaryCopy = primary ? primaryActionCopy(t.aiCategory, primary.id) : null;

  function runCommand(id: CorreoAiCommandId) {
    if (primary && id === primary.id) setPrimaryExecuted(true);
    if (id === "lead") {
      onOpenAiLead();
      return;
    }
    onAiCommand?.(id);
  }

  const continueActions = useMemo(
    () =>
      resolveContinueActions({
        primaryTitle: primaryCopy?.title ?? null,
        primaryExecuted,
        lastReadAt: readCursorAt,
        messages: detail.messages,
        dealFechaEntrega: t.dealFechaEntrega,
        attachments: detail.attachments,
        degraded: detail.degraded,
        accountId: t.accountId,
        canEdit: canEditCorreos,
      }),
    [
      primaryCopy?.title,
      primaryExecuted,
      readCursorAt,
      detail.messages,
      t.dealFechaEntrega,
      detail.attachments,
      detail.degraded,
      t.accountId,
      canEditCorreos,
    ],
  );

  return (
    <div className="ds-page-enter space-y-3">
      {primary && primaryCopy && !primaryExecuted && (
        <button
          type="button"
          onClick={() => runCommand(primary.id)}
          className="flex min-h-[72px] w-full flex-col items-start gap-1 rounded-2xl border border-tint-violet/40 bg-tint-violet/10 px-3.5 py-3 text-left ds-tap"
        >
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-tint-violet-fg">
            <Sparkles className="h-4 w-4" /> ✦ {primaryCopy.title}
          </span>
          <span className="text-[12px] leading-snug text-ds-text-2">{primaryCopy.subtitle}</span>
        </button>
      )}

      <CorreoContextCascade
        detail={detail}
        onAssociate={onAssociate}
        onOpenAttachments={onOpenAttachments}
      />

      <CorreoThreadSummaryCard
        threadId={t.id}
        initialSummary={t.threadSummary}
        lastReadAt={readCursorAt}
        messageCount={detail.messages.length}
        continueActions={continueActions}
        compact={compact}
        onAction={(id) => {
          if (id === "primary" && primary) {
            runCommand(primary.id);
            return;
          }
          if (id === "deadline") {
            onGoTo("trabajo");
            return;
          }
          if (id === "attachments") {
            onOpenAttachments?.();
            return;
          }
          if (id === "associate") {
            onGoTo("contexto");
            return;
          }
          if (id === "reply") {
            onRequestReply?.();
          }
        }}
      />

      {secondary.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-ds-border-subtle bg-ds-surface-2">
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left ds-tap"
          >
            <Sparkles className="h-4 w-4 text-tint-violet-fg" />
            <span className="text-[13px] font-medium text-ds-text-1">Más acciones IA</span>
            <ChevronDown
              className={`ml-auto h-4 w-4 text-ds-text-4 transition-transform ${moreOpen ? "rotate-180" : ""}`}
            />
          </button>
          {moreOpen && (
            <div className="flex flex-wrap gap-1.5 px-3 pb-3">
              {secondary.map((cmd) => (
                <button
                  key={cmd.id}
                  type="button"
                  onClick={() => runCommand(cmd.id)}
                  className="inline-flex min-h-11 items-center rounded-full border border-ds-border-default bg-ds-surface-1 px-3 text-[12px] font-medium text-ds-text-2 ds-tap hover:border-primary sm:min-h-8"
                >
                  {cmd.shortLabel}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
