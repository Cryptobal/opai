/**
 * Acción "Ingreso guardia turno extra" (Fase 7, Bloque 8). Modal: instalación +
 * guardia (por RUT o código, resuelto al enviar) + fecha + tipo. Crea con el
 * servicio compartido `createTurnoExtra`; los errores de duplicado del servicio
 * se muestran como `response_action: errors`. Gate: módulo `ops`.
 */

import { prisma } from "@/lib/prisma";
import { hasModuleAccess } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { createTurnoExtra } from "@/lib/turno-extra-create";
import { infoView } from "../modals/views";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });
const opt = (value: string, label: string) => ({ text: pt(label), value });
const fieldError = (block: string, msg: string): ModalSubmitResult => ({ ack: { response_action: "errors", errors: { [block]: msg } } });

async function build(ctx: ModalOpenContext): Promise<SlackView> {
  const insts = await prisma.crmInstallation.findMany({
    where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true },
  });
  if (insts.length === 0) return infoView("Turno extra", "No hay instalaciones configuradas en este tenant.");
  const tipoOpts = [opt("turno_extra", "Turno extra"), opt("hora_extra", "Hora extra")];
  return {
    type: "modal",
    callback_id: "opai_turno_extra",
    title: pt("Turno extra"),
    submit: pt("Registrar"),
    close: pt("Cancelar"),
    blocks: [
      { type: "input", block_id: "installation", label: pt("Instalación"),
        element: { type: "static_select", action_id: "v", options: insts.map((i) => opt(i.id, i.name)) } },
      { type: "input", block_id: "guardia", label: pt("Guardia (RUT o código)"),
        element: { type: "plain_text_input", action_id: "v", placeholder: pt("12345678-9 o G-001") } },
      { type: "input", block_id: "date", label: pt("Fecha"),
        element: { type: "datepicker", action_id: "v", initial_date: new Date().toISOString().slice(0, 10) } },
      { type: "input", block_id: "tipo", label: pt("Tipo"),
        element: { type: "static_select", action_id: "v", options: tipoOpts, initial_option: tipoOpts[0] } },
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
    select: { id: true },
  });
  if (!g) return fieldError("guardia", "No encontré un guardia con ese RUT o código.");

  const r = await createTurnoExtra({
    tenantId: ctx.tenantId, createdBy: ctx.linked.adminId, installationId, guardiaId: g.id, date, tipo,
  });
  if (!r.ok) return fieldError("date", r.error);

  await logAudit({
    action: "CREATE", entity: "OpsTurnoExtra", entityId: r.id, tenantId: ctx.tenantId,
    userId: ctx.linked.adminId, details: { via: "slack_modal", tipo },
  }).catch(() => {});

  const view: SlackView = {
    type: "modal", title: pt("Turno extra"), close: pt("Listo"),
    blocks: [{ type: "section", text: { type: "mrkdwn", text: `✅ ${tipo === "hora_extra" ? "Hora extra" : "Turno extra"} registrado (pendiente de aprobación).` } }],
  };
  return { ack: { response_action: "update", view } };
}

export const turnoExtraModal: ModalDef = {
  callbackId: "opai_turno_extra",
  title: "Turno extra",
  requires: (perms) => hasModuleAccess(perms, "ops"),
  requiresMessage: "Necesitas acceso al módulo de Operaciones.",
  build,
  submit,
};
