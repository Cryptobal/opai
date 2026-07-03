/**
 * Modal "Crear ticket en OPAI" (Fase 5, Bloque 5). Se abre desde el shortcut de
 * mensaje `opai_crear_ticket` (prellenado con el texto del mensaje) o desde
 * `/opai ticket`. Al enviar crea el ticket con el servicio compartido
 * `createOpsTicket` y responde en el hilo del mensaje con el folio + link.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/permissions";
import { createOpsTicket } from "@/lib/tickets-create";
import { logAudit } from "@/lib/audit";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { slackPostMessage } from "../api";
import { packMetadata } from "./views";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "./types";

const CALLBACK = "opai_crear_ticket";
const PRIORITIES = [
  { value: "p3", label: "P3 — Media" },
  { value: "p2", label: "P2 — Alta" },
  { value: "p1", label: "P1 — Crítica" },
  { value: "p4", label: "P4 — Baja" },
];
const pt = (text: string) => ({ type: "plain_text", text });
const opt = (value: string, label: string) => ({ text: pt(label.slice(0, 75)), value });

async function build(ctx: ModalOpenContext): Promise<SlackView> {
  const types = await prisma.opsTicketType.findMany({
    where: { tenantId: ctx.tenantId, isActive: true, origin: { in: ["internal", "both"] } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
    take: 100,
  });
  const typeOptions = types.map((t) => opt(t.id, t.name));
  const prioOptions = PRIORITIES.map((p) => opt(p.value, p.label));
  const initialTitle = (ctx.messageText ?? "").slice(0, 150) || undefined;

  const blocks: unknown[] = [
    {
      type: "input", block_id: "title",
      label: pt("Asunto"),
      element: { type: "plain_text_input", action_id: "v", initial_value: initialTitle, max_length: 200 },
    },
  ];
  if (typeOptions.length) {
    blocks.push({
      type: "input", block_id: "type", optional: true, label: pt("Tipo"),
      element: { type: "static_select", action_id: "v", options: typeOptions, initial_option: typeOptions[0] },
    });
  }
  blocks.push({
    type: "input", block_id: "priority", optional: true, label: pt("Prioridad"),
    element: { type: "static_select", action_id: "v", options: prioOptions, initial_option: prioOptions[0] },
  });
  blocks.push({
    type: "input", block_id: "description", optional: true, label: pt("Descripción"),
    element: {
      type: "plain_text_input", action_id: "v", multiline: true, max_length: 2000,
      initial_value: ctx.messageText ? ctx.messageText.slice(0, 2000) : undefined,
    },
  });

  return {
    type: "modal",
    callback_id: CALLBACK,
    private_metadata: packMetadata({ kind: "ticket", channelId: ctx.channelId, messageTs: ctx.messageTs }),
    title: pt("Nuevo ticket"),
    submit: pt("Crear"),
    close: pt("Cancelar"),
    blocks,
  };
}

const schema = z.object({ title: z.string().trim().min(1).max(200) });

async function submit(ctx: ModalSubmitContext): Promise<ModalSubmitResult> {
  const parsed = schema.safeParse({ title: ctx.state.title?.v?.value ?? "" });
  if (!parsed.success) {
    return { ack: { response_action: "errors", errors: { title: "Escribe un asunto para el ticket." } } };
  }
  const ticketTypeId = ctx.state.type?.v?.selected_option?.value ?? null;
  const priority = ctx.state.priority?.v?.selected_option?.value ?? null;
  const description = ctx.state.description?.v?.value?.trim() || null;
  const { channelId, messageTs } = ctx.metadata;

  const work = async () => {
    const result = await createOpsTicket({
      tenantId: ctx.tenantId, actorId: ctx.linked.adminId, reportedBy: ctx.linked.adminId,
      title: parsed.data.title, description, ticketTypeId, priority, source: "slack",
    });
    if (!channelId) return;
    if ("error" in result) {
      await slackPostMessage(ctx.workspace.botToken, {
        channel: channelId, thread_ts: messageTs, text: `⚠️ No se pudo crear el ticket: ${result.error}`,
      }).catch(() => {});
      return;
    }
    await logAudit({
      action: "CREATE", entity: "OpsTicket", entityId: result.id, tenantId: ctx.tenantId,
      userId: ctx.linked.adminId, details: { code: result.code, via: "slack_shortcut" },
    });
    const url = `${getCanonicalSiteUrl()}/ops/tickets/${result.id}`;
    await slackPostMessage(ctx.workspace.botToken, {
      channel: channelId, thread_ts: messageTs, text: `🎫 Ticket ${result.code} creado: ${result.title}`,
      blocks: [
        { type: "section", text: { type: "mrkdwn", text: `🎫 Ticket *${result.code}* creado\n${result.title}` } },
        { type: "actions", elements: [{ type: "button", text: pt("Ver en OPAI"), url, style: "primary" }] },
      ],
    }).catch((e) => console.error("[slack] reply ticket falló:", e));
  };

  return { ack: {}, work };
}

export const ticketModal: ModalDef = {
  callbackId: CALLBACK,
  title: "Nuevo ticket",
  requires: (perms) => hasModuleAccess(perms, "ops"),
  requiresMessage: "Necesitas acceso al módulo de Operaciones para crear tickets.",
  build,
  submit,
};
