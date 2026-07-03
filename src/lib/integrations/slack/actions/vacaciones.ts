/**
 * Acción "Solicitud de vacaciones" (Fase 7, Bloque 9). No hay módulo de
 * vacaciones dedicado: es un tipo de ticket (`solicitud_vacaciones`, con cadena
 * de aprobación RRHH → Operaciones). Reusa el servicio `createOpsTicket`. Modal:
 * fechas desde/hasta + motivo. Gate: módulo `ops`.
 */

import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { createOpsTicket } from "@/lib/tickets-create";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { infoView } from "../modals/views";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });
const fieldError = (block: string, msg: string): ModalSubmitResult => ({ ack: { response_action: "errors", errors: { [block]: msg } } });

async function vacationTypeId(tenantId: string): Promise<string | null> {
  const t = await prisma.opsTicketType.findFirst({
    where: { tenantId, slug: "solicitud_vacaciones", isActive: true },
    select: { id: true },
  });
  return t?.id ?? null;
}

async function build(ctx: ModalOpenContext): Promise<SlackView> {
  if (!(await vacationTypeId(ctx.tenantId))) {
    return infoView("Vacaciones", "El flujo de solicitud de vacaciones no está configurado en tu organización.");
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    type: "modal",
    callback_id: "opai_vacaciones",
    title: pt("Solicitud de vacaciones"),
    submit: pt("Enviar"),
    close: pt("Cancelar"),
    blocks: [
      { type: "input", block_id: "desde", label: pt("Desde"),
        element: { type: "datepicker", action_id: "v", initial_date: today } },
      { type: "input", block_id: "hasta", label: pt("Hasta"),
        element: { type: "datepicker", action_id: "v", initial_date: today } },
      { type: "input", block_id: "motivo", optional: true, label: pt("Motivo (opcional)"),
        element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 500 } },
    ],
  };
}

async function submit(ctx: ModalSubmitContext): Promise<ModalSubmitResult> {
  const desde = ctx.state.desde?.v?.selected_date;
  const hasta = ctx.state.hasta?.v?.selected_date;
  const motivo = ctx.state.motivo?.v?.value?.trim();
  if (!desde) return fieldError("desde", "Elige la fecha de inicio.");
  if (!hasta) return fieldError("hasta", "Elige la fecha de término.");
  if (hasta < desde) return fieldError("hasta", "La fecha de término no puede ser anterior al inicio.");

  const typeId = await vacationTypeId(ctx.tenantId);
  if (!typeId) return fieldError("desde", "El flujo de vacaciones no está configurado.");

  const description = `Vacaciones del ${desde} al ${hasta}.${motivo ? ` Motivo: ${motivo}` : ""}`;
  const r = await createOpsTicket({
    tenantId: ctx.tenantId, actorId: ctx.linked.adminId, reportedBy: ctx.linked.adminId,
    title: "Solicitud de vacaciones", description, ticketTypeId: typeId, source: "slack",
  });
  if ("error" in r) return fieldError("desde", r.error);

  await logAudit({
    action: "CREATE", entity: "OpsTicket", entityId: r.id, tenantId: ctx.tenantId,
    userId: ctx.linked.adminId, details: { code: r.code, via: "slack_vacaciones" },
  }).catch(() => {});

  const url = `${getCanonicalSiteUrl()}/ops/tickets/${r.id}`;
  const view: SlackView = {
    type: "modal", title: pt("Vacaciones"), close: pt("Listo"),
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: `🏖️ Solicitud *${r.code}* enviada (pendiente de aprobación de RRHH).` } },
      { type: "actions", elements: [{ type: "button", text: pt("Ver en OPAI"), url, style: "primary" }] },
    ],
  };
  return { ack: { response_action: "update", view } };
}

export const vacacionesModal: ModalDef = {
  callbackId: "opai_vacaciones",
  title: "Solicitud de vacaciones",
  requires: (perms) => hasModuleAccess(perms, "ops"),
  requiresMessage: "Necesitas acceso al módulo de Operaciones.",
  build,
  submit,
};
