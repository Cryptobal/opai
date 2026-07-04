/**
 * Acción "Ingresar turno extra" (Fase 7 · semántica F20): registra al GUARDIA
 * que entra a cubrir como turno extra — instalación + guardia existente (por
 * RUT o código) + fecha + tipo — con el servicio compartido `createTurnoExtra`
 * (mismo flujo que la web; queda `pending` de aprobación). NO es "crear un
 * turno extra" genérico: es el ingreso del que cubre. Si la persona aún no
 * existe como guardia, el alta completa (datos personales/bancarios) vive en
 * `/personas/guardias/ingreso-te` — el modal la enlaza. Los errores de
 * duplicado del servicio se muestran como `response_action: errors`.
 * Gate: módulo `ops`.
 */

import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { createTurnoExtra } from "@/lib/turno-extra-create";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { infoView } from "../modals/views";
import { modalTitle } from "../modals/title";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const TITLE = "Ingresar turno extra"; // 20 chars (límite Slack: 24)
const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });
const opt = (value: string, label: string) => ({ text: pt(label), value });
const fieldError = (block: string, msg: string): ModalSubmitResult => ({ ack: { response_action: "errors", errors: { [block]: msg } } });

async function build(ctx: ModalOpenContext): Promise<SlackView> {
  const insts = await prisma.crmInstallation.findMany({
    where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true },
  });
  if (insts.length === 0) return infoView(TITLE, "No hay instalaciones configuradas en este tenant.");
  const tipoOpts = [opt("turno_extra", "Turno extra"), opt("hora_extra", "Hora extra")];
  return {
    type: "modal",
    callback_id: "opai_turno_extra",
    title: modalTitle(TITLE),
    submit: pt("Registrar"),
    close: pt("Cancelar"),
    blocks: [
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Registra al guardia que entra a cubrir. Queda *pendiente de aprobación*." }],
      },
      { type: "input", block_id: "guardia", label: pt("Guardia que cubre (RUT o código)"),
        element: { type: "plain_text_input", action_id: "v", placeholder: pt("12345678-9 o G-001") } },
      { type: "input", block_id: "installation", label: pt("Instalación que cubre"),
        element: { type: "static_select", action_id: "v", options: insts.map((i) => opt(i.id, i.name)) } },
      { type: "input", block_id: "date", label: pt("Fecha del turno"),
        element: { type: "datepicker", action_id: "v", initial_date: new Date().toISOString().slice(0, 10) } },
      { type: "input", block_id: "tipo", label: pt("Tipo"),
        element: { type: "static_select", action_id: "v", options: tipoOpts, initial_option: tipoOpts[0] } },
      {
        type: "context",
        elements: [{
          type: "mrkdwn",
          text: `¿La persona no existe aún como guardia? <${getCanonicalSiteUrl()}/personas/guardias/ingreso-te|Regístrala en OPAI> y vuelve acá.`,
        }],
      },
    ],
  };
}

async function submit(ctx: ModalSubmitContext): Promise<ModalSubmitResult> {
  const installationId = ctx.state.installation?.v?.selected_option?.value;
  const rutOrCode = (ctx.state.guardia?.v?.value ?? "").trim();
  const date = ctx.state.date?.v?.selected_date;
  const tipo = (ctx.state.tipo?.v?.selected_option?.value ?? "turno_extra") as "turno_extra" | "hora_extra";
  if (!installationId) return fieldError("installation", "Elige una instalación.");
  if (!rutOrCode) return fieldError("guardia", "Ingresa el RUT o código del guardia.");
  if (!date) return fieldError("date", "Elige una fecha.");

  const g = await prisma.opsGuardia.findFirst({
    where: { tenantId: ctx.tenantId, OR: [{ code: rutOrCode }, { persona: { rut: rutOrCode } }] },
    select: { id: true, persona: { select: { firstName: true, lastName: true } } },
  });
  if (!g) return fieldError("guardia", "No encontré un guardia con ese RUT o código. Si es una persona nueva, regístrala primero en OPAI (Personas → Ingreso TE).");

  const r = await createTurnoExtra({
    tenantId: ctx.tenantId, createdBy: ctx.linked.adminId, installationId, guardiaId: g.id, date, tipo,
  });
  if (!r.ok) return fieldError("date", r.error);

  await logAudit({
    action: "CREATE", entity: "OpsTurnoExtra", entityId: r.id, tenantId: ctx.tenantId,
    userId: ctx.linked.adminId, details: { via: "slack_modal", tipo },
  }).catch(() => {});

  const nombre = [g.persona?.firstName, g.persona?.lastName].filter(Boolean).join(" ") || rutOrCode;
  const view: SlackView = {
    type: "modal", title: modalTitle(TITLE), close: pt("Listo"),
    blocks: [{
      type: "section",
      text: { type: "mrkdwn", text: `✅ Ingreso registrado: *${nombre}* cubre como ${tipo === "hora_extra" ? "hora extra" : "turno extra"} el ${date} (pendiente de aprobación).` },
    }],
  };
  return { ack: { response_action: "update", view } };
}

export const turnoExtraModal: ModalDef = {
  callbackId: "opai_turno_extra",
  title: TITLE,
  requires: (perms) => hasModuleAccess(perms, "ops"),
  requiresMessage: "Necesitas acceso al módulo de Operaciones.",
  build,
  submit,
};
