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
import { formatPersonName } from "@/lib/personas";
import { parseDateOnly, toISODate } from "@/lib/ops";
import { createTurnoExtra } from "@/lib/turno-extra-create";
import { refreshRelevoBoardForInstallation } from "@/lib/ops/relevo-board";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { infoView, packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const TITLE = "Ingresar turno extra"; // 20 chars (límite Slack: 24)
const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75) });
const opt = (value: string, label: string) => ({ text: pt(label), value });
const fieldError = (block: string, msg: string): ModalSubmitResult => ({ ack: { response_action: "errors", errors: { [block]: msg } } });

const TIPO_OPTS = [opt("turno_extra", "Turno extra"), opt("hora_extra", "Hora extra")];

/** Buscador de guardia activo (external_select) — espejo de save-note. */
const guardiaPickerBlock = {
  type: "input", block_id: "guardia", label: pt("Guardia que cubre"),
  element: { type: "external_select", action_id: "v", min_query_length: 2, placeholder: pt("Busca por apellido o RUT…") },
};

const registrarPersonaContext = {
  type: "context",
  elements: [{
    type: "mrkdwn",
    text: `¿La persona no existe aún como guardia? <${getCanonicalSiteUrl()}/personas/guardias/ingreso-te|Regístrala en OPAI> y vuelve acá.`,
  }],
};

/**
 * Modal del flujo de relevo: la asistencia (`ctx.arg`) ya conoce instalación,
 * puesto y fecha. Se muestran de solo lectura y el guardia se elige con el
 * buscador; el contexto viaja en `private_metadata`.
 */
async function buildFromAsistencia(ctx: ModalOpenContext, asistenciaId: string): Promise<SlackView> {
  const asistencia = await prisma.opsAsistenciaDiaria.findFirst({
    where: { id: asistenciaId, tenantId: ctx.tenantId },
    select: {
      installationId: true, puestoId: true, date: true,
      installation: { select: { name: true } },
    },
  });
  if (!asistencia) return infoView(TITLE, "No se encontró la asistencia a cubrir.");
  const fechaISO = toISODate(asistencia.date);
  return {
    type: "modal",
    callback_id: "opai_turno_extra",
    title: modalTitle(TITLE),
    submit: pt("Registrar"),
    close: pt("Cancelar"),
    private_metadata: packMetadata({
      kind: "opai_turno_extra",
      entityId: asistenciaId,
      teInstallationId: asistencia.installationId,
      tePuestoId: asistencia.puestoId ?? undefined,
      teDate: fechaISO,
    }),
    blocks: [
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "Registra al guardia que entra a cubrir. Queda *pendiente de aprobación*." }],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Instalación:* ${asistencia.installation?.name ?? "—"}\n*Fecha del turno:* ${fechaISO}` },
      },
      guardiaPickerBlock,
      { type: "input", block_id: "tipo", label: pt("Tipo"),
        element: { type: "static_select", action_id: "v", options: TIPO_OPTS, initial_option: TIPO_OPTS[0] } },
      registrarPersonaContext,
    ],
  };
}

async function build(ctx: ModalOpenContext): Promise<SlackView> {
  // Flujo de relevo: el asistenciaId llega como ctx.arg → contexto derivado.
  if (ctx.arg) return buildFromAsistencia(ctx, ctx.arg);

  // Standalone (hub): sin asistencia, se pregunta instalación + fecha.
  const insts = await prisma.crmInstallation.findMany({
    where: { tenantId: ctx.tenantId }, orderBy: { name: "asc" }, take: 100, select: { id: true, name: true },
  });
  if (insts.length === 0) return infoView(TITLE, "No hay instalaciones configuradas en este tenant.");
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
      guardiaPickerBlock,
      { type: "input", block_id: "installation", label: pt("Instalación que cubre"),
        element: { type: "static_select", action_id: "v", options: insts.map((i) => opt(i.id, i.name)) } },
      { type: "input", block_id: "date", label: pt("Fecha del turno"),
        element: { type: "datepicker", action_id: "v", initial_date: toISODate(new Date()) } },
      { type: "input", block_id: "tipo", label: pt("Tipo"),
        element: { type: "static_select", action_id: "v", options: TIPO_OPTS, initial_option: TIPO_OPTS[0] } },
      registrarPersonaContext,
    ],
  };
}

function successView(nombre: string, tipo: string, date: string): SlackView {
  return {
    type: "modal", title: modalTitle(TITLE), close: pt("Listo"),
    blocks: [{
      type: "section",
      text: { type: "mrkdwn", text: `✅ Ingreso registrado: *${nombre}* cubre como ${tipo === "hora_extra" ? "hora extra" : "turno extra"} el ${date} (pendiente de aprobación).` },
    }],
  };
}

async function submit(ctx: ModalSubmitContext): Promise<ModalSubmitResult> {
  const tipo = (ctx.state.tipo?.v?.selected_option?.value ?? "turno_extra") as "turno_extra" | "hora_extra";
  const asistenciaId = ctx.metadata.entityId;

  // ── Flujo de relevo: instalación/puesto/fecha derivados de la asistencia ──
  if (asistenciaId) {
    const installationId = ctx.metadata.teInstallationId;
    const puestoId = ctx.metadata.tePuestoId ?? null;
    const date = ctx.metadata.teDate;
    const guardiaId = ctx.state.guardia?.v?.selected_option?.value;
    if (!installationId || !date) return fieldError("guardia", "Falta el contexto del turno. Reabre desde el tablero de relevo.");
    if (!guardiaId) return fieldError("guardia", "Elige al guardia que cubre.");

    const g = await prisma.opsGuardia.findFirst({
      where: { id: guardiaId, tenantId: ctx.tenantId },
      select: { id: true, code: true, persona: { select: { firstName: true, lastName: true } } },
    });
    if (!g) return fieldError("guardia", "No encontré ese guardia. Búscalo de nuevo por apellido o RUT.");

    const r = await createTurnoExtra({
      tenantId: ctx.tenantId, createdBy: ctx.linked.adminId, installationId, guardiaId: g.id, date, tipo, puestoId,
    });
    if (!r.ok) return fieldError("guardia", r.error);

    await logAudit({
      action: "CREATE", entity: "OpsTurnoExtra", entityId: r.id, tenantId: ctx.tenantId,
      userId: ctx.linked.adminId, details: { via: "slack_modal", tipo, origen: "relevo", asistenciaId },
    }).catch(() => {});

    const nombre = formatPersonName(g.persona?.firstName, g.persona?.lastName) || g.code || "Guardia";
    return {
      ack: { response_action: "update", view: successView(nombre, tipo, date) },
      // Refresca el tablero para reflejar el TE recién ingresado (best-effort).
      work: async () => {
        await refreshRelevoBoardForInstallation(ctx.tenantId, installationId, parseDateOnly(date)).catch(() => {});
      },
    };
  }

  // ── Standalone (hub): instalación + fecha desde inputs, guardia por id ──
  const installationId = ctx.state.installation?.v?.selected_option?.value;
  const guardiaId = ctx.state.guardia?.v?.selected_option?.value;
  const date = ctx.state.date?.v?.selected_date;
  if (!installationId) return fieldError("installation", "Elige una instalación.");
  if (!guardiaId) return fieldError("guardia", "Elige al guardia que cubre.");
  if (!date) return fieldError("date", "Elige una fecha.");

  const g = await prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId: ctx.tenantId },
    select: { id: true, code: true, persona: { select: { firstName: true, lastName: true } } },
  });
  if (!g) return fieldError("guardia", "No encontré ese guardia. Búscalo de nuevo por apellido o RUT.");

  const r = await createTurnoExtra({
    tenantId: ctx.tenantId, createdBy: ctx.linked.adminId, installationId, guardiaId: g.id, date, tipo,
  });
  if (!r.ok) return fieldError("date", r.error);

  await logAudit({
    action: "CREATE", entity: "OpsTurnoExtra", entityId: r.id, tenantId: ctx.tenantId,
    userId: ctx.linked.adminId, details: { via: "slack_modal", tipo },
  }).catch(() => {});

  const nombre = formatPersonName(g.persona?.firstName, g.persona?.lastName) || g.code || "Guardia";
  return { ack: { response_action: "update", view: successView(nombre, tipo, date) } };
}

/**
 * block_suggestion del external_select "Guardia que cubre": guardias activos del
 * tenant por apellido / nombre / RUT / código. Espejo de handleSaveNoteSuggestion.
 */
export async function handleTurnoExtraGuardiaSuggestion(
  payload: { team?: { id?: string }; user?: { id?: string }; value?: string },
): Promise<{ options: unknown[] }> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const query = (payload.value ?? "").trim();
  if (!teamId || !slackUserId || query.length < 2) return { options: [] };

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return { options: [] };
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return { options: [] };
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !hasModuleAccess(linked.perms, "ops")) return { options: [] };
  const tenantId = workspace.tenantId;

  const guardias = await prisma.opsGuardia.findMany({
    where: {
      tenantId, status: "active",
      OR: [
        { code: { contains: query, mode: "insensitive" } },
        { persona: { rut: { contains: query, mode: "insensitive" } } },
        { persona: { firstName: { contains: query, mode: "insensitive" } } },
        { persona: { lastName: { contains: query, mode: "insensitive" } } },
      ],
    },
    orderBy: { persona: { lastName: "asc" } }, take: 20,
    select: { id: true, code: true, persona: { select: { firstName: true, lastName: true, rut: true } } },
  });

  const options = guardias.map((g) => {
    const nombre = formatPersonName(g.persona?.firstName, g.persona?.lastName) || "Guardia";
    const ref = g.persona?.rut || g.code || "";
    return { text: pt(`${nombre}${ref ? ` · ${ref}` : ""}`.slice(0, 72)), value: g.id };
  }).slice(0, 100);

  return { options };
}

export const turnoExtraModal: ModalDef = {
  callbackId: "opai_turno_extra",
  title: TITLE,
  requires: (perms) => hasModuleAccess(perms, "ops"),
  requiresMessage: "Necesitas acceso al módulo de Operaciones.",
  build,
  submit,
};
