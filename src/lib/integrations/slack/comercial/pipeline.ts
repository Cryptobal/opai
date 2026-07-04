/**
 * Pipeline vivo en Slack (Fase 15, B4 · pulido F17): `/opai pipeline`.
 *
 * Overview por etapa (nombre · N negocios · Σ CLP) → drill a la etapa → deals
 * ordenados del más frío al más fresco (semáforo por días en etapa: 🟢 <7 · 🟠
 * 7-14 · 🔴 >14). Cada fila: *Cuenta* · negocio · monto · ⏱ días · badge 🏠 si
 * tiene sala OPEN; botones 🔗 Abrir en OPAI · 🏠 Ir/Abrir sala · 🟢 WhatsApp;
 * overflow 📞 Llamar · Avanzar · Nota · Ganado · Perdido. Navegación "← Pipeline"
 * de vuelta al overview (views.update). El cambio de etapa usa el servicio real
 * (changeDealStage → CrmDealStageHistory; al ganar emite deal_won → tarjeta 🎉).
 *
 * LÍMITE (B3.5): 🟢 WhatsApp es botón URL — Slack NO notifica los clics de
 * botones URL, así que el contacto NO se puede registrar solo; el registro
 * queda vía "📝 Nota" manual o el followup-log de otras acciones.
 *
 * LÍMITE (F21): Slack RECHAZA con `invalid_arguments` cualquier view cuyo
 * botón/opción tenga una URL que no sea http(s) — el overflow "📞 Llamar"
 * (`tel:`) mataba el drill COMPLETO en toda etapa con un deal con teléfono
 * (por eso "solo Prospección abría": era la única sin teléfonos). En modales
 * NO va `tel:`; el contacto telefónico queda vía 🟢 WhatsApp (https, mismo
 * número). Los links mrkdwn `tel:` en MENSAJES (lead card) siguen ok.
 */

import { prisma } from "@/lib/prisma";
import { canView, canEdit } from "@/lib/permissions";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView, slackPushView } from "../api";
import { changeDealStage } from "@/lib/crm/change-deal-stage";
import { packMetadata, unpackMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import { clp, resolveDealWaUrl, addDealNote, markDealWon, markDealLost } from "./deal-common";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

/* ── Consultas ── */

async function listStagesWithCounts(tenantId: string) {
  const [stages, grouped] = await Promise.all([
    prisma.crmPipelineStage.findMany({ where: { tenantId, isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true, isClosedWon: true, isClosedLost: true } }),
    prisma.crmDeal.groupBy({ by: ["stageId"], where: { tenantId, status: "open" }, _count: { _all: true }, _sum: { amount: true } }),
  ]);
  const byStage = new Map(grouped.map((g) => [g.stageId, { count: g._count._all, sum: Number(g._sum.amount ?? 0) }]));
  return stages
    .filter((s) => !s.isClosedWon && !s.isClosedLost)
    .map((s) => ({ id: s.id, name: s.name, count: byStage.get(s.id)?.count ?? 0, sum: byStage.get(s.id)?.sum ?? 0 }));
}

interface DrillDeal {
  id: string; amount: number; updatedAt: Date; accountName: string; title: string;
  contactFirst: string | null; contactPhone: string | null;
  /** Fecha de entrada a la etapa: último cambio en el historial, o `createdAt`
   * como fallback para negocios pre-tracking (nunca queda en "—"). */
  enteredAt: Date;
}

async function listDealsInStage(tenantId: string, stageId: string): Promise<{ stageName: string; deals: DrillDeal[] }> {
  const [stage, deals] = await Promise.all([
    prisma.crmPipelineStage.findFirst({ where: { id: stageId, tenantId }, select: { name: true } }),
    prisma.crmDeal.findMany({
      where: { tenantId, stageId, status: "open" }, orderBy: { updatedAt: "desc" }, take: 15,
      select: { id: true, title: true, amount: true, updatedAt: true, createdAt: true, account: { select: { name: true } }, primaryContact: { select: { firstName: true, phone: true } } },
    }),
  ]);
  const hist = deals.length
    ? await prisma.crmDealStageHistory.findMany({ where: { tenantId, dealId: { in: deals.map((d) => d.id) }, toStageId: stageId }, orderBy: { changedAt: "desc" }, select: { dealId: true, changedAt: true } })
    : [];
  const enteredAt = new Map<string, Date>();
  for (const h of hist) if (!enteredAt.has(h.dealId)) enteredAt.set(h.dealId, h.changedAt);
  const mapped: DrillDeal[] = deals.map((d) => ({
    id: d.id, amount: Number(d.amount ?? 0), updatedAt: d.updatedAt, accountName: d.account?.name ?? "Cliente", title: d.title ?? "Negocio",
    contactFirst: d.primaryContact?.firstName ?? null, contactPhone: d.primaryContact?.phone ?? null,
    enteredAt: enteredAt.get(d.id) ?? d.createdAt,
  }));
  // Semáforo de frío: los más viejos en etapa (más días) saltan primero — es la
  // función del radar. Orden por antigüedad de entrada ascendente = días DESC.
  mapped.sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
  return { stageName: stage?.name ?? "Etapa", deals: mapped };
}

/** dealId → channelId de la sala OPEN, para el badge 🏠 y el botón "Ir a la sala". */
async function openRoomsForDeals(tenantId: string, dealIds: string[]): Promise<Map<string, string>> {
  if (!dealIds.length) return new Map();
  const rooms = await prisma.crmDealSlackRoom.findMany({
    where: { tenantId, dealId: { in: dealIds }, status: "OPEN" },
    select: { dealId: true, slackChannelId: true },
  });
  return new Map(rooms.map((r) => [r.dealId, r.slackChannelId]));
}

/* ── Vistas ── */

function overviewView(stages: Array<{ id: string; name: string; count: number; sum: number }>): SlackView {
  const blocks: unknown[] = [{ type: "section", text: { type: "mrkdwn", text: "*Pipeline comercial* — negocios abiertos por etapa" } }, { type: "divider" }];
  const total = stages.reduce((s, x) => s + x.sum, 0);
  for (const s of stages) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${s.name}*\n${s.count} negocio(s) · ${clp(s.sum)}` },
      accessory: { type: "button", action_id: "pipe_open", value: s.id, text: pt("Ver →") },
    });
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Total abierto: *${clp(total)}*` }] });
  return { type: "modal", callback_id: "opai_pipeline", title: modalTitle("Pipeline"), close: pt("Cerrar"), blocks };
}

/** Días en la etapa (siempre calculable: el fallback a `createdAt` vive en la query). */
const daysInStage = (d: Date): number => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
const dfmt = (d: Date): string => d.toLocaleDateString("es-CL");
/** URL canónica al detalle del negocio en OPAI. */
const dealOpaiUrl = (dealId: string): string => `${getCanonicalSiteUrl()}/crm/deals/${dealId}`;
/** Deep-link al canal de la sala en el cliente de Slack. */
const roomClientUrl = (teamId: string, channelId: string): string => `https://app.slack.com/client/${teamId}/${channelId}`;
/** Semáforo de frío por días en etapa: verde <7 · 🟠 7-14 · 🔴 >14. */
const coldDot = (days: number): string => (days > 14 ? "🔴" : days >= 7 ? "🟠" : "🟢");

/**
 * Overflow de acciones de escritura por negocio (Avanzar/Nota/Ganado/Perdido,
 * solo si el usuario puede editar). Los links de navegación (Abrir en OPAI,
 * Ir a la sala, WhatsApp) van como botones URL https. PROHIBIDO agregar aquí
 * opciones con URL `tel:`/`mailto:`: Slack rechaza el modal entero con
 * `invalid_arguments` (ver LÍMITE F21 en el header).
 */
function dealMenu(dealId: string, canWrite: boolean): unknown | null {
  if (!canWrite) return null;
  const options: unknown[] = [
    { text: pt("⏩ Avanzar etapa"), value: `advance:${dealId}` },
    { text: pt("📝 Nota rápida"), value: `note:${dealId}` },
    { text: pt("🎉 Ganado"), value: `won:${dealId}` },
    { text: pt("💔 Perdido"), value: `lost:${dealId}` },
  ];
  return { type: "overflow", action_id: "pipe_deal_menu", options };
}

interface DrillCtx {
  teamId: string;
  canWrite: boolean;
  /** dealId → channelId de la sala OPEN (badge 🏠 + botón "Ir a la sala"). */
  rooms: Map<string, string>;
  waUrls: Map<string, string | null>;
}

/**
 * Bloques de UNA fila del drill. Null-safety TOTAL (F21): los negocios reales
 * vienen con huecos (sin contacto, sin teléfono, sin cuenta, sin historial) y
 * NINGÚN campo opcional puede asumir presencia — todo tiene fallback. Solo se
 * emiten URLs http(s) (ver LÍMITE F21).
 */
function dealRowBlocks(d: DrillDeal, ctx: DrillCtx): unknown[] {
  const account = (d.accountName || "Cliente").trim() || "Cliente";
  const title = (d.title || "Negocio").trim() || "Negocio";
  const amount = Number.isFinite(d.amount) ? d.amount : 0;
  const wa = ctx.waUrls.get(d.id) ?? null;
  const roomChannel = ctx.rooms.get(d.id) ?? null;
  const badge = roomChannel ? "🏠 " : "";
  const entered = d.enteredAt instanceof Date && !Number.isNaN(d.enteredAt.getTime()) ? d.enteredAt : new Date();
  const days = daysInStage(entered);
  const act = d.updatedAt instanceof Date && !Number.isNaN(d.updatedAt.getTime()) ? ` · act ${dfmt(d.updatedAt)}` : "";
  const menu = dealMenu(d.id, ctx.canWrite);
  const section: Record<string, unknown> = {
    type: "section",
    text: { type: "mrkdwn", text: `${badge}*${account}* · ${title}\n${clp(amount)} · ⏱ ${coldDot(days)} ${days}d en etapa${act}` },
  };
  if (menu) section.accessory = menu;
  // Links/navegación por negocio: 🔗 Abrir en OPAI · 🏠 sala (ir/abrir) · 🟢 WhatsApp.
  const linkBtns: unknown[] = [{ type: "button", action_id: "pipe_deal_open", url: dealOpaiUrl(d.id), text: pt("🔗 Abrir en OPAI") }];
  if (roomChannel) linkBtns.push({ type: "button", action_id: "pipe_deal_roomlink", url: roomClientUrl(ctx.teamId, roomChannel), text: pt("🏠 Ir a la sala") });
  else if (ctx.canWrite) linkBtns.push({ type: "button", action_id: "pipe_deal_room", value: d.id, text: pt("🏠 Abrir sala") });
  if (wa && /^https:\/\//.test(wa)) linkBtns.push({ type: "button", action_id: "pipe_deal_wa", url: wa, text: pt("🟢 WhatsApp") });
  return [section, { type: "actions", block_id: `opai_dealbtns_${d.id}`, elements: linkBtns }];
}

function drillView(stageId: string, stageName: string, deals: DrillDeal[], ctx: DrillCtx, notice?: string): SlackView {
  const blocks: unknown[] = [
    // Navegación: volver a la vista de etapas sin cerrar el modal (views.update).
    { type: "actions", block_id: "opai_pipe_nav", elements: [{ type: "button", action_id: "pipe_back", text: pt("← Pipeline") }] },
  ];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });
  if (deals.length === 0) {
    blocks.push(
      { type: "section", text: { type: "mrkdwn", text: `✨ *${stageName}* no tiene negocios abiertos.` } },
      { type: "context", elements: [{ type: "mrkdwn", text: "Cuando un negocio entre a esta etapa, aparecerá aquí con su semáforo de frío." }] },
    );
  }
  let broken = 0;
  for (const d of deals) {
    // Blindaje por FILA (F21): una fila corrupta se salta con log — jamás mata
    // el modal completo (antes, un solo deal con datos rotos = etapa muda).
    try {
      blocks.push(...dealRowBlocks(d, ctx));
    } catch (err) {
      broken += 1;
      console.error(`[slack] pipeline drill: fila corrupta dealId=${d.id} etapa="${stageName}":`, err);
    }
  }
  if (broken > 0) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `⚠️ ${broken} negocio(s) no se pudieron mostrar (datos incompletos — revisa los logs).` }] });
  }
  return {
    type: "modal", callback_id: "opai_pipeline_stage",
    private_metadata: packMetadata({ kind: "pipeline_stage", stageId }),
    title: modalTitle(stageName), close: pt("Cerrar"), blocks,
  };
}

async function renderDrill(tenantId: string, teamId: string, canWrite: boolean, stageId: string, notice?: string): Promise<SlackView> {
  const { stageName, deals } = await listDealsInStage(tenantId, stageId);
  const [pairs, rooms] = await Promise.all([
    Promise.all(deals.map(async (d) => [d.id, await resolveDealWaUrl(tenantId, { contactPhone: d.contactPhone, contactFirst: d.contactFirst, accountName: d.accountName }).catch(() => null)] as const)),
    openRoomsForDeals(tenantId, deals.map((d) => d.id)),
  ]);
  return drillView(stageId, stageName, deals, { teamId, canWrite, rooms, waUrls: new Map(pairs) }, notice);
}

/* ── Modales secundarios (Avanzar / Nota / Perdido) ── */

export async function advanceView(tenantId: string, dealId: string): Promise<SlackView> {
  const stages = await prisma.crmPipelineStage.findMany({ where: { tenantId, isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true } });
  return {
    type: "modal", callback_id: "pipe_advance", private_metadata: packMetadata({ kind: "pipe_advance", dealId }),
    title: modalTitle("Avanzar etapa"), submit: pt("Mover"), close: pt("Cancelar"),
    blocks: [{ type: "input", block_id: "stage", label: pt("Nueva etapa"), element: { type: "static_select", action_id: "v", options: stages.map((s) => ({ text: pt(s.name), value: s.id })) } }],
  };
}

export function noteView(dealId: string): SlackView {
  return {
    type: "modal", callback_id: "pipe_note", private_metadata: packMetadata({ kind: "pipe_note", dealId }),
    title: modalTitle("Nota rápida"), submit: pt("Guardar"), close: pt("Cancelar"),
    blocks: [{ type: "input", block_id: "note", label: pt("Nota"), element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 2000 } }],
  };
}

export function lostView(dealId: string): SlackView {
  return {
    type: "modal", callback_id: "pipe_lost", private_metadata: packMetadata({ kind: "pipe_lost", dealId }),
    title: modalTitle("Marcar perdido"), submit: pt("Perdido"), close: pt("Cancelar"),
    blocks: [{ type: "input", block_id: "reason", label: pt("Motivo"), element: { type: "plain_text_input", action_id: "v", multiline: true, min_length: 3, max_length: 300 } }],
  };
}

function done(title: string, msg: string): ModalSubmitResult {
  return { ack: { response_action: "update", view: { type: "modal", title: { type: "plain_text", text: title.slice(0, 24) }, close: { type: "plain_text", text: "Listo" }, blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }] } } };
}

/* ── Dispatch de block_actions ── */

export async function handlePipelineAction(payload: {
  team?: { id?: string }; user?: { id?: string }; trigger_id?: string;
  view?: { id?: string; private_metadata?: string };
  actions?: Array<{ action_id?: string; value?: string; selected_option?: { value?: string } }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  if (!teamId || !slackUserId || !action?.action_id) return;
  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;
  const tenantId = workspace.tenantId;
  const canWrite = canEdit(linked.perms, "crm", "deals");

  const stageIdOf = () => unpackMetadata(payload.view?.private_metadata).stageId ?? "";

  // Overview → drill. Patrón loading-first (F11/F14): el trigger_id vence en
  // ~3s, así que PRIMERO se apila un modal de carga (consume el trigger) y
  // DESPUÉS se resuelve el contenido con views.update. Si el contenido falla,
  // el usuario ve un aviso claro en el modal — nunca un botón mudo (F21).
  if (action.action_id === "pipe_open") {
    const stageId = action.value;
    if (!stageId || !payload.trigger_id) return;
    const { loadingView, infoView } = await import("../modals/views");
    let viewId = "";
    try {
      ({ id: viewId } = await slackPushView(workspace.botToken, payload.trigger_id, loadingView("Pipeline")));
    } catch (err) {
      console.error(`[slack] pipeline drill: push del loading falló stageId=${stageId}:`, err);
      return;
    }
    try {
      await slackUpdateView(workspace.botToken, viewId, await renderDrill(tenantId, teamId, canWrite, stageId));
    } catch (err) {
      console.error(`[slack] pipeline drill: no se pudo renderizar stageId=${stageId}:`, err);
      await slackUpdateView(workspace.botToken, viewId, infoView("Pipeline", "⚠️ No se pudo cargar esta etapa. Intenta de nuevo — el detalle quedó en los logs.")).catch(() => {});
    }
    return;
  }

  // Navegación: volver del drill a la vista de etapas (sin cerrar el modal).
  if (action.action_id === "pipe_back") {
    if (payload.view?.id) await slackUpdateView(workspace.botToken, payload.view.id, overviewView(await listStagesWithCounts(tenantId)));
    return;
  }

  // Abrir sala del negocio (botón) → crea/reusa la sala y refresca el drill.
  if (action.action_id === "pipe_deal_room") {
    const dealId = action.value;
    if (!dealId || !canWrite) return;
    const stageId = stageIdOf();
    const { openDealRoom } = await import("../deal-rooms/room");
    const r = await openDealRoom(tenantId, dealId, linked.adminId);
    const notice = r.ok
      ? r.alreadyExisted
        ? `🏠 La sala ya existe: <#${r.channelId}>`
        : `🏠 Sala abierta: <#${r.channelId}> — ficha viva fijada.`
      : `⚠️ ${r.error ?? "No se pudo abrir la sala."}`;
    if (payload.view?.id && stageId) await slackUpdateView(workspace.botToken, payload.view.id, await renderDrill(tenantId, teamId, canWrite, stageId, notice));
    return;
  }

  // Menú por deal (overflow): advance | note | won | lost.
  if (action.action_id === "pipe_deal_menu") {
    const [op, dealId] = (action.selected_option?.value ?? "").split(":");
    if (!op || !dealId) return;
    if (!canWrite) return;
    const stageId = stageIdOf();
    if (op === "advance") { if (payload.trigger_id) await slackPushView(workspace.botToken, payload.trigger_id, await advanceView(tenantId, dealId)); return; }
    if (op === "note") { if (payload.trigger_id) await slackPushView(workspace.botToken, payload.trigger_id, noteView(dealId)); return; }
    if (op === "lost") { if (payload.trigger_id) await slackPushView(workspace.botToken, payload.trigger_id, lostView(dealId)); return; }
    if (op === "won") {
      const r = await markDealWon(tenantId, linked.adminId, dealId);
      if (payload.view?.id && stageId) await slackUpdateView(workspace.botToken, payload.view.id, await renderDrill(tenantId, teamId, canWrite, stageId, r.ok ? "🎉 Negocio marcado como ganado." : `⚠️ ${r.error}`));
      return;
    }
  }
}

/* ── ModalDefs ── */

export const pipelineModal: ModalDef = {
  callbackId: "opai_pipeline",
  title: "Pipeline",
  requires: (perms) => canView(perms, "crm", "deals"),
  requiresMessage: "Necesitas acceso a Negocios (CRM).",
  build: async (ctx: ModalOpenContext) => overviewView(await listStagesWithCounts(ctx.tenantId)),
  submit: async () => ({ ack: {} }),
};

export const advanceStageModal: ModalDef = {
  callbackId: "pipe_advance", title: "Avanzar etapa",
  requires: (perms) => canEdit(perms, "crm", "deals"),
  build: async (ctx) => advanceView(ctx.tenantId, ""), // fallback; el open real (push) prellena el dealId
  submit: async (ctx: ModalSubmitContext) => {
    const dealId = ctx.metadata.dealId ?? "";
    const stageId = ctx.state.stage?.v?.selected_option?.value;
    if (!stageId) return { ack: { response_action: "errors", errors: { stage: "Elige una etapa." } } };
    const r = await changeDealStage({ tenantId: ctx.tenantId, userId: ctx.linked.adminId, dealId, stageId });
    return done("Avanzar etapa", r.kind === "ok" ? "⏩ Negocio movido de etapa." : "⚠️ No se pudo mover.");
  },
};

export const dealNoteModal: ModalDef = {
  callbackId: "pipe_note", title: "Nota rápida",
  requires: (perms) => canEdit(perms, "crm", "deals"),
  build: () => noteView(""), // fallback; el open real (push) prellena el dealId
  submit: async (ctx: ModalSubmitContext) => {
    const dealId = ctx.metadata.dealId ?? "";
    const note = (ctx.state.note?.v?.value ?? "").trim();
    if (!note) return { ack: { response_action: "errors", errors: { note: "Escribe una nota." } } };
    await addDealNote(ctx.tenantId, ctx.linked.adminId, dealId, note);
    return done("Nota rápida", "📝 Nota agregada al negocio.");
  },
};

export const dealLostModal: ModalDef = {
  callbackId: "pipe_lost", title: "Marcar perdido",
  requires: (perms) => canEdit(perms, "crm", "deals"),
  build: () => lostView(""), // fallback; el open real (push) prellena el dealId
  submit: async (ctx: ModalSubmitContext) => {
    const dealId = ctx.metadata.dealId ?? "";
    const reason = (ctx.state.reason?.v?.value ?? "").trim();
    if (reason.length < 3) return { ack: { response_action: "errors", errors: { reason: "Indica el motivo." } } };
    const r = await markDealLost(ctx.tenantId, ctx.linked.adminId, dealId, reason);
    return done("Marcar perdido", r.ok ? "💔 Negocio marcado como perdido." : `⚠️ ${r.error}`);
  },
};
