/**
 * Modal "Nueva rendición de gasto" (Fase 5, Bloque 6). Se abre desde el shortcut
 * global `opai_nueva_rendicion` o desde `/opai rendicion`. Gate por capability de
 * rendiciones del admin vinculado. Al enviar crea la rendición en DRAFT con el
 * servicio compartido, adjunta la boleta (file_input → R2) y confirma por DM.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canEdit } from "@/lib/permissions";
import { createRendicion, attachRendicionReceipt } from "@/lib/rendiciones-create";
import { logAudit } from "@/lib/audit";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { callSlack, slackPostMessage } from "../api";
import { slackDownloadFile } from "../files";
import { packMetadata } from "./views";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "./types";

const CALLBACK = "opai_nueva_rendicion";
const pt = (text: string) => ({ type: "plain_text", text });

async function build(ctx: ModalOpenContext): Promise<SlackView> {
  const items = await prisma.financeRendicionItem.findMany({
    where: { tenantId: ctx.tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 100,
  });
  const catOptions = items.map((i) => ({ text: pt(i.name.slice(0, 75)), value: i.id }));
  const blocks: unknown[] = [
    { type: "input", block_id: "amount", label: pt("Monto (CLP)"),
      element: { type: "plain_text_input", action_id: "v", placeholder: pt("Ej: 15000") } },
    { type: "input", block_id: "date", label: pt("Fecha"),
      element: { type: "datepicker", action_id: "v", initial_date: new Date().toISOString().slice(0, 10) } },
  ];
  if (catOptions.length) {
    blocks.push({ type: "input", block_id: "category", optional: true, label: pt("Categoría"),
      element: { type: "static_select", action_id: "v", options: catOptions } });
  }
  blocks.push({ type: "input", block_id: "description", optional: true, label: pt("Descripción"),
    element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 500 } });
  blocks.push({ type: "input", block_id: "receipt", optional: true, label: pt("Boleta (foto o PDF)"),
    element: { type: "file_input", action_id: "v", filetypes: ["jpg", "jpeg", "png", "pdf"], max_files: 3 } });

  return {
    type: "modal",
    callback_id: CALLBACK,
    private_metadata: packMetadata({ kind: "rendicion", channelId: ctx.channelId }),
    title: pt("Nueva rendición"),
    submit: pt("Registrar"),
    close: pt("Cancelar"),
    blocks,
  };
}

const schema = z.object({ amount: z.number().int().positive(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

async function submit(ctx: ModalSubmitContext): Promise<ModalSubmitResult> {
  const amount = parseInt((ctx.state.amount?.v?.value ?? "").replace(/[^\d]/g, ""), 10);
  const date = ctx.state.date?.v?.selected_date ?? "";
  const parsed = schema.safeParse({ amount: isNaN(amount) ? 0 : amount, date });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    if (isNaN(amount) || amount <= 0) errors.amount = "Ingresa un monto válido en pesos.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "Elige una fecha.";
    return { ack: { response_action: "errors", errors } };
  }
  const itemId = ctx.state.category?.v?.selected_option?.value ?? null;
  const description = ctx.state.description?.v?.value?.trim() || null;
  const files = ctx.state.receipt?.v?.files ?? [];

  const work = async () => {
    const rendicion = await createRendicion({
      tenantId: ctx.tenantId, submitterId: ctx.linked.adminId,
      type: "PURCHASE", amount: parsed.data.amount, date: parsed.data.date, description, itemId,
    });
    for (const f of files.slice(0, 3)) {
      if (!f.url_private) continue;
      try {
        const { buffer } = await slackDownloadFile(f.url_private, ctx.workspace.botToken);
        await attachRendicionReceipt({
          tenantId: ctx.tenantId, rendicionId: rendicion.id, uploadedById: ctx.linked.adminId,
          buffer, fileName: f.name ?? "boleta", mimeType: f.mimetype ?? "application/octet-stream",
        });
      } catch (e) {
        console.error("[slack] boleta no adjuntada:", e);
      }
    }
    await logAudit({
      action: "CREATE", entity: "FinanceRendicion", entityId: rendicion.id, tenantId: ctx.tenantId,
      userId: ctx.linked.adminId, details: { code: rendicion.code, via: "slack_modal" },
    });
    const url = `${getCanonicalSiteUrl()}/finanzas/rendiciones/${rendicion.id}`;
    try {
      const dm = await callSlack("conversations.open", { users: ctx.slackUserId }, ctx.workspace.botToken);
      const dmId = (dm.channel as { id?: string })?.id;
      if (dmId) {
        await slackPostMessage(ctx.workspace.botToken, {
          channel: dmId, text: `🧾 Rendición ${rendicion.code} registrada`,
          blocks: [
            { type: "section", text: { type: "mrkdwn", text: `🧾 *Rendición ${rendicion.code}* registrada por $${parsed.data.amount.toLocaleString("es-CL")}` } },
            { type: "actions", elements: [{ type: "button", text: pt("Ver en OPAI"), url, style: "primary" }] },
          ],
        });
      }
    } catch (e) {
      console.error("[slack] confirmación rendición falló:", e);
    }
  };

  return { ack: {}, work };
}

export const rendicionModal: ModalDef = {
  callbackId: CALLBACK,
  title: "Nueva rendición",
  requires: (perms) => canEdit(perms, "finance", "rendiciones"),
  requiresMessage: "Necesitas permiso para crear rendiciones en Finanzas.",
  build,
  submit,
};
