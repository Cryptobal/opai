"use client";

import { CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { CorreoCrmPanel } from "./CorreoCrmPanel";
import { CorreoAssociationBar } from "./CorreoAssociationBar";
import { CorreoMessages } from "./CorreoMessages";
import { CorreoAttachments } from "./CorreoAttachments";
import { CorreoTasksPanel } from "./CorreoTasksPanel";
import { LeadFromEmailPanel } from "./LeadFromEmailPanel";
import { CorreoReplyBox } from "./CorreoReplyBox";
import { CorreoThreadActions } from "./CorreoThreadActions";
import { CorreoContactPanel } from "./CorreoContactPanel";
import { CorreoSummaryPanel } from "./CorreoSummaryPanel";
import { CorreoLinksPanel } from "./CorreoLinksPanel";
import type { CorreoDetail } from "@/modules/crm/email/correos.types";

type Props = {
  detail: CorreoDetail;
  canModify?: boolean;
  aiOpen: boolean;
  setAiOpen: (v: boolean) => void;
  onAssociate: (p: { accountId: string | null; dealId: string | null }) => void;
  onRefresh: () => void;
  onClose?: () => void;
  onReply?: () => void;
  onSnooze?: () => void;
  alwaysShowImages?: boolean;
  onAlwaysShowImages?: () => void;
};

export function CorreoDrawerContent({
  detail,
  canModify,
  aiOpen,
  setAiOpen,
  onAssociate,
  onRefresh,
  onClose,
  onReply,
  onSnooze,
  alwaysShowImages,
  onAlwaysShowImages,
}: Props) {
  const gmailUrl = detail.thread.providerThreadId
    ? `https://mail.google.com/mail/u/0/#all/${detail.thread.providerThreadId}`
    : null;

  return (
    <>
      {/* Rediseño Gmail: header compacto de iconos + Resumir arriba; el CORREO
          al frente; barra de acciones / composer bajo demanda; el panel de
          trabajo al fondo. */}
      <div className="flex flex-wrap items-center gap-2">
        {canModify && (
          <CorreoThreadActions
            threadId={detail.thread.id}
            isUnread={detail.thread.isUnread}
            archived={Boolean(detail.thread.archivedAt)}
            starred={Boolean(detail.thread.starredAt)}
            inSpam={Boolean(detail.thread.spamAt)}
            canModify
            variant="drawer"
            compact
            onDone={onRefresh}
            onClose={onClose}
            onReply={onReply}
            onSnooze={onSnooze}
          />
        )}
        {gmailUrl && (
          <a href={gmailUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[12px] text-primary ds-tap">
            Abrir en Gmail <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {/* A01/A02: Resumir hilo — arriba, como pidió Carlos (acceso rápido). */}
      <CorreoSummaryPanel key={`summary-${detail.thread.id}`} threadId={detail.thread.id} />
      {detail.degraded && (
        <div className="rounded-xl border border-status-warn-border bg-status-warn-soft px-3 py-2.5 text-[13px] text-status-warn-fg">
          No se pudieron cargar los adjuntos de este hilo desde Gmail. Reintentá
          en unos segundos.
        </div>
      )}
      {/* EL CORREO al frente. */}
      <CorreoMessages
        messages={detail.messages}
        alwaysShowImages={alwaysShowImages}
        onAlwaysShowImages={onAlwaysShowImages}
      />
      <CorreoAttachments
        items={detail.attachments}
        threadId={detail.thread.id}
        dealId={detail.thread.dealId}
        dealTitle={detail.thread.dealTitle}
        accountId={detail.thread.accountId}
      />
      {/* Responder — barra estilo Gmail (o composer bajo demanda), justo bajo el
          correo. Nada de acciones de respuesta debajo del panel. */}
      <CorreoReplyBox key={`reply-${detail.thread.id}`} detail={detail} onSent={onRefresh} />

      {/* Panel comercial plegable al FONDO: Crear lead con IA primero, luego
          Asociar, Vincular, Tareas y Contacto. */}
      <CorreoCrmPanel>
        {detail.thread.leadId ? (
          <div className="flex items-center gap-2 rounded-xl border border-status-ok-border bg-status-ok-soft p-2.5 text-[13px] text-status-ok-fg">
            <CheckCircle2 className="h-4 w-4" /> Lead creado desde este correo.
          </div>
        ) : aiOpen ? (
          <LeadFromEmailPanel
            threadId={detail.thread.id}
            hasAccount={Boolean(detail.thread.accountId)}
            onClose={() => setAiOpen(false)}
            onCreated={() => { setAiOpen(false); onRefresh(); }}
          />
        ) : (
          <button type="button" onClick={() => setAiOpen(true)} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[13px] font-medium text-primary-foreground ds-tap">
            <Sparkles className="h-4 w-4" /> Crear lead con IA
          </button>
        )}
        <CorreoAssociationBar
          threadId={detail.thread.id}
          accountId={detail.thread.accountId}
          accountName={detail.thread.accountName}
          dealId={detail.thread.dealId}
          dealTitle={detail.thread.dealTitle}
          subject={detail.thread.subject}
          onAssociate={onAssociate}
        />
        {/* O01-O04: entidades vinculadas + sugerencia IA. */}
        <CorreoLinksPanel key={`links-${detail.thread.id}`} threadId={detail.thread.id} />
        <CorreoTasksPanel key={`tasks-${detail.thread.id}`} threadId={detail.thread.id} subject={detail.thread.subject} />
        {/* P11: ficha del contacto asociado + últimas conversaciones. */}
        <CorreoContactPanel key={`contact-${detail.thread.id}`} threadId={detail.thread.id} />
      </CorreoCrmPanel>
    </>
  );
}
