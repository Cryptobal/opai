"use client";

/**
 * Mockup visual — lector de hilo compacto (mobile).
 * Solo UI; fetch mockeado. Ruta pública: /opai-ds-playground/correo-reader-mobile
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Moon, Sun } from "lucide-react";
import { CorreoReaderMobileHeader } from "@/components/crm/correos/CorreoReaderMobileHeader";
import { CorreoReaderTitleBlock } from "@/components/crm/correos/CorreoReaderTitleBlock";
import { CorreoReaderContextStrip } from "@/components/crm/correos/CorreoReaderContextStrip";
import { CorreoReaderSummary } from "@/components/crm/correos/CorreoReaderSummary";
import { CorreoMessageRow } from "@/components/crm/correos/CorreoMessageRow";
import { CorreoReaderScrollContext } from "@/components/crm/correos/CorreoReaderScrollContext";
import { CorreoWorkProvider } from "@/components/crm/correos/CorreoWorkContext";
import type { CorreoDetail, CorreoMessageDTO } from "@/modules/crm/email/correos.types";

const OPEN_TASKS = [
  { id: "1", title: "Enviar cotización", status: "open", dueAt: null, allDay: true },
  { id: "2", title: "Llamar a cliente", status: "open", dueAt: null, allDay: true },
];

function msg(
  partial: Partial<CorreoMessageDTO> & { id: string; snippetHint?: string },
): CorreoMessageDTO {
  const text =
    partial.textBody ??
    partial.snippetHint ??
    "Hola,\n\nAdjunto la propuesta actualizada para la obra de Valparaíso.\n\nSaludos,\nMaría";
  return {
    id: partial.id,
    providerMessageId: partial.id,
    direction: partial.direction ?? "in",
    fromEmail: partial.fromEmail ?? "Maria Soto <maria@comtel.cl>",
    toEmails: partial.toEmails ?? ["yo@gard.cl"],
    ccEmails: [],
    replyToEmail: null,
    subject: partial.subject ?? "Propuesta de servicio",
    htmlBody: null,
    textBody: text,
    sentAt: partial.sentAt ?? "2026-07-30T15:20:00.000Z",
    isDraft: false,
  };
}

const BASE: CorreoDetail = {
  thread: {
    id: "demo-thread",
    subject: "Propuesta servicio de seguridad — Obra Valparaíso Comtel",
    accountId: "acc-1",
    accountName: "Comtel Ltda",
    dealId: "deal-1",
    dealTitle: "Obra Valparaíso",
    dealStageName: "Propuesta",
    dealFechaEntrega: null,
    dealIsLicitacion: false,
    leadId: null,
    providerThreadId: null,
    isUnread: false,
    archivedAt: null,
    trashedAt: null,
    snoozedUntil: null,
    starredAt: null,
    spamAt: null,
    sharedWithAccount: true,
    lastMessageAt: "2026-07-30T15:20:00.000Z",
    aiCategory: null,
    aiUrgency: null,
    aiSentiment: null,
    aiSummary: null,
    aiClassifiedAt: null,
    lastReadAt: null,
    threadSummary: null,
  },
  messages: [
    msg({
      id: "m1",
      snippetHint: "Buenos días, ¿pueden cotizar vigilancia 24/7?",
      sentAt: "2026-07-28T10:00:00.000Z",
    }),
    msg({
      id: "m2",
      direction: "out",
      fromEmail: "yo@gard.cl",
      snippetHint: "Claro, te envío propuesta esta semana.",
      sentAt: "2026-07-28T14:00:00.000Z",
    }),
    msg({
      id: "m3",
      textBody:
        "Hola,\n\nAdjunto la propuesta actualizada para la obra de Valparaíso. Incluye 4 puestos 24/7 y supervisor de turno.\n\nQuedamos atentos a sus comentarios para ajustar cobertura.\n\nSaludos,\nMaría Soto\nComtel Ltda",
      sentAt: "2026-07-30T15:20:00.000Z",
    }),
  ],
  attachments: [],
  degraded: false,
};

function jsonRes(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default function CorreoReaderMobilePlayground() {
  const [dark, setDark] = useState(true);
  const [sheet, setSheet] = useState<"none" | "assoc" | "tasks">("none");
  const [starred, setStarred] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const orig = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/tasks")) return jsonRes({ tasks: OPEN_TASKS });
      if (url.includes("/links")) return jsonRes({ links: [] });
      if (url.includes("/contact-context")) return jsonRes({ contact: null });
      if (url.includes("/deals")) return jsonRes({ items: [] });
      return orig(input, init);
    }) as typeof fetch;
    setReady(true);
    return () => {
      globalThis.fetch = orig;
    };
  }, []);

  const detail: CorreoDetail = {
    ...BASE,
    thread: {
      ...BASE.thread,
      starredAt: starred ? "2026-07-30T16:00:00.000Z" : null,
    },
  };

  return (
    <div className={dark ? "dark" : undefined}>
      <div className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto flex max-w-md flex-col border-x border-ds-border-subtle bg-background shadow-ds-lg">
          <div className="flex items-center justify-between gap-2 border-b border-ds-border-subtle px-3 py-2">
            <Link href="/opai-ds-playground" className="text-[12px] text-ds-text-3">
              ← Playground
            </Link>
            <p className="text-[12px] font-medium text-ds-text-2">Lector mobile</p>
            <button
              type="button"
              onClick={() => setDark((d) => !d)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ds-text-2"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>

          <div
            className="relative flex h-[720px] flex-col overflow-hidden bg-background"
            data-testid="reader-viewport"
          >
            {!ready ? (
              <p className="p-4 text-[13px] text-ds-text-3">Cargando mock…</p>
            ) : (
              <CorreoReaderScrollContext.Provider value={{ scrolled: false }}>
                <CorreoWorkProvider threadId="demo-thread" accountId="acc-1">
                  <CorreoReaderMobileHeader
                    subject={detail.thread.subject}
                    onClose={() => {}}
                    threadActions={{
                      isUnread: false,
                      archived: false,
                      trashed: false,
                      onArchive: () => {},
                      onTrash: () => {},
                      onToggleRead: () => {},
                      onOpenCopilot: () => setSheet("assoc"),
                      copilotPending: true,
                      onOpenTasks: () => setSheet("tasks"),
                    }}
                  />
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pt-1.5 pb-20">
                    <CorreoReaderTitleBlock
                      detail={detail}
                      canModify
                      onToggleStar={() => setStarred((s) => !s)}
                      below={
                        <div data-testid="context-strip">
                          <CorreoReaderContextStrip
                            accountId={detail.thread.accountId}
                            accountName={detail.thread.accountName}
                            canEdit
                            onOpenAssociations={() => setSheet("assoc")}
                            onSearchAccount={() => setSheet("assoc")}
                          />
                        </div>
                      }
                    />
                    <CorreoReaderSummary
                      threadId={detail.thread.id}
                      initialSummary={null}
                      messageCount={detail.messages.length}
                    />
                    {detail.messages.slice(0, -1).map((m) => (
                      <CorreoMessageRow
                        key={m.id}
                        m={m}
                        attachmentCount={0}
                        onOpen={() => {}}
                      />
                    ))}
                    <div
                      data-testid="message-body"
                      className="whitespace-pre-wrap border-t border-ds-border-subtle pt-3 text-[14px] leading-relaxed text-ds-text-1"
                    >
                      {detail.messages[detail.messages.length - 1]?.textBody}
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 flex gap-2 border-t border-ds-border-subtle bg-ds-surface-1/95 px-3 py-2 backdrop-blur">
                    <button
                      type="button"
                      className="flex h-11 flex-1 items-center justify-center rounded-full bg-primary text-[13px] font-medium text-primary-foreground"
                    >
                      Responder
                    </button>
                    <button
                      type="button"
                      className="flex h-11 flex-1 items-center justify-center rounded-full border border-ds-border-default text-[13px] font-medium text-ds-text-1"
                    >
                      Reenviar
                    </button>
                  </div>
                </CorreoWorkProvider>
              </CorreoReaderScrollContext.Provider>
            )}

            {sheet !== "none" && (
              <div className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40">
                <div className="max-h-[70%] rounded-t-2xl bg-ds-surface-1 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-display text-[15px] font-semibold">
                      {sheet === "assoc" ? "Asociaciones" : "Tareas"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSheet("none")}
                      className="text-[13px] text-primary"
                    >
                      Cerrar
                    </button>
                  </div>
                  {sheet === "assoc" ? (
                    <ul className="space-y-2 text-[13px]">
                      <li className="font-medium">Cuenta · Comtel Ltda</li>
                      <li className="pl-4 text-ds-text-2">Proyecto · Obra Valparaíso</li>
                      <li className="pl-8 text-ds-text-3">Propuesta · Enviada</li>
                    </ul>
                  ) : (
                    <ul className="space-y-2 text-[13px]">
                      <li>☐ Enviar cotización</li>
                      <li>☐ Llamar a cliente</li>
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
