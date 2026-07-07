/**
 * Pipeline vivo en Slack (Fase 15, B4 · pulido F17 · rediseño F21): `/opai pipeline`.
 *
 * Overview clase mundial: header protagonista (`💼 N negocios · $total abiertos`
 * + 🔎 Buscar negocio + 📊 Abrir en OPAI), cada etapa como bloque denso con
 * mini-barra proporcional `▓▓▓░░░░░░░` (monto vs total), `% del total` e
 * indicador `🔴 N fríos` (>14d en etapa, mismo cálculo del semáforo del drill);
 * botón por etapa con texto propio (`3 negocios →`). Con 8+ etapas el excedente
 * se pliega en "…y N etapas más". Drill a la etapa → deals ordenados del más
 * frío al más fresco (semáforo por días en etapa: 🟢 <7 · 🟠 7-14 · 🔴 >14).
 * Cada fila: *Cuenta* · negocio · monto · ⏱ días · badge 🏠 si tiene sala OPEN;
 * botones 🔗 Abrir en OPAI · 🏠 Ir/Abrir sala · 🟢 WhatsApp; overflow Avanzar ·
 * Nota · Ganado · Perdido. Navegación "← Pipeline" de vuelta al overview
 * (views.update). El cambio de etapa usa el servicio real (changeDealStage →
 * CrmDealStageHistory; al ganar emite deal_won → tarjeta 🎉).
 *
 * LÍMITE (B3.5): 🟢 WhatsApp es botón URL — Slack NO notifica los clics de
 * botones URL, así que el contacto NO se puede registrar solo; el registro
 * queda vía "📝 Nota" manual o el followup-log de otras acciones. 📞 Llamar
 * abre un mini-modal con el teléfono tappable (link mrkdwn).
 *
 * LÍMITE (F21): Slack RECHAZA con `invalid_arguments` cualquier view cuyo
 * botón/opción tenga una URL que no sea http(s) — el overflow "📞 Llamar"
 * con `url: tel:` mataba el drill COMPLETO en toda etapa con un deal con
 * teléfono (por eso "solo Prospección abría": era la única sin teléfonos).
 * En modales JAMÁS va una URL `tel:`/`mailto:` en botones u options; el
 * esquema `tel:` solo se usa como link mrkdwn (mensajes y mini-modal Llamar).
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
import { listAdjudicados, countAdjudicados, type AdjudicadoDeal } from "./adjudicados";
import { normalizeWaPhone } from "./lead-actions";
import { INTERACTION_TYPES, interactionLabel, isInteractionType, type InteractionTypeMeta } from "@/lib/crm/interaction-types";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

/* ── Consultas ── */

interface StageRow {
  id: string;
  name: string;
  count: number;
  sum: number;
  /** Negocios FRÍOS en la etapa: >14 días sin salir de ella (mismo cálculo
   * que el semáforo 🔴 del drill F17: entrada por historial, fallback createdAt). */
  cold: number;
}

/** 🔴 fríos por etapa (>14d en etapa), coherente con el semáforo del drill. */
async function countColdByStage(tenantId: string): Promise<Map<string, number>> {
  const deals = await prisma.crmDeal.findMany({
    where: { tenantId, status: "open" },
    select: { id: true, stageId: true, createdAt: true },
  });
  if (!deals.length) return new Map();
  const hist = await prisma.crmDealStageHistory.findMany({
    where: { tenantId, dealId: { in: deals.map((d) => d.id) } },
    orderBy: { changedAt: "desc" },
    select: { dealId: true, toStageId: true, changedAt: true },
  });
  const stageByDeal = new Map(deals.map((d) => [d.id, d.stageId]));
  const enteredAt = new Map<string, Date>();
  for (const h of hist) {
    if (h.toStageId !== stageByDeal.get(h.dealId)) continue;
    if (!enteredAt.has(h.dealId)) enteredAt.set(h.dealId, h.changedAt);
  }
  const cold = new Map<string, number>();
  for (const d of deals) {
    const days = daysInStage(enteredAt.get(d.id) ?? d.createdAt);
    if (days > 14) cold.set(d.stageId, (cold.get(d.stageId) ?? 0) + 1);
  }
  return cold;
}

async function listStagesWithCounts(tenantId: string): Promise<StageRow[]> {
  const [stages, grouped, cold] = await Promise.all([
    prisma.crmPipelineStage.findMany({ where: { tenantId, isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true, isClosedWon: true, isClosedLost: true, isAccepted: true } }),
    prisma.crmDeal.groupBy({ by: ["stageId"], where: { tenantId, status: "open" }, _count: { _all: true }, _sum: { amount: true } }),
    countColdByStage(tenantId).catch((err) => {
      console.error("[slack] pipeline: cálculo de fríos falló (se omite el indicador):", err);
      return new Map<string, number>();
    }),
  ]);
  const byStage = new Map(grouped.map((g) => [g.stageId, { count: g._count._all, sum: Number(g._sum.amount ?? 0) }]));
  // `isAccepted` (Adjudicado) NO va como columna abierta: esos negocios tienen su
  // propia sección "🏁 Adjudicados por iniciar" (listAdjudicados). Sin este filtro
  // se listaban DOS veces — como etapa y como adjudicado — y el total los duplicaba
  // (mismo criterio que el Hub, hub-queries.ts, que también excluye stage.isAccepted).
  return stages
    .filter((s) => !s.isClosedWon && !s.isClosedLost && !s.isAccepted)
    .map((s) => ({ id: s.id, name: s.name, count: byStage.get(s.id)?.count ?? 0, sum: byStage.get(s.id)?.sum ?? 0, cold: cold.get(s.id) ?? 0 }));
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

const nNegocios = (n: number): string => `${n} negocio${n === 1 ? "" : "s"}`;

/** Cuántas etapas se muestran sin plegar (presupuesto visual a 375px). */
const OVERVIEW_MAX_STAGES = 8;

/**
 * Overview (F21, rediseño): header con el total, y cada etapa en UNA línea
 * limpia — nombre + conteo · monto · % · 🔴 fríos (solo si hay), con botón
 * "N →" al costado. Sin mini-barras ASCII (eran ruido visual). Con más de 8
 * etapas, el excedente se pliega en "…y N etapas más" (pipe_more).
 */
function overviewView(stages: StageRow[], adjCount: number, expanded = false): SlackView {
  const total = stages.reduce((s, x) => s + x.sum, 0);
  const totalCount = stages.reduce((s, x) => s + x.count, 0);
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: `💼 *Pipeline comercial* — ${nNegocios(totalCount)} · *${clp(total)}* abiertos` } },
    {
      type: "actions",
      block_id: "opai_pipe_header",
      elements: [
        { type: "button", action_id: "pipe_search", text: pt("🔎 Buscar negocio") },
        // Vista web del pipeline (auditado F21): /crm/deals (kanban/lista).
        { type: "button", action_id: "pipe_opai_web", url: `${getCanonicalSiteUrl()}/crm/deals`, text: pt("📊 Abrir en OPAI") },
      ],
    },
    { type: "divider" },
  ];
  const visible = expanded ? stages : stages.slice(0, OVERVIEW_MAX_STAGES);
  for (const s of visible) {
    const pct = total > 0 ? Math.round((s.sum / total) * 100) : 0;
    const coldTag = s.cold > 0 ? ` · 🔴 ${s.cold} frío${s.cold === 1 ? "" : "s"}` : "";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${s.name}*\n${nNegocios(s.count)} · ${clp(s.sum)} · ${pct}%${coldTag}` },
      accessory: { type: "button", action_id: "pipe_open", value: s.id, text: pt(`${s.count} →`) },
    });
  }
  const hidden = stages.length - visible.length;
  if (hidden > 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `…y ${hidden} etapa${hidden === 1 ? "" : "s"} más` },
      accessory: { type: "button", action_id: "pipe_more", text: pt(`+${hidden} etapa${hidden === 1 ? "" : "s"} →`) },
    });
  }
  // Adjudicados por iniciar (isAccepted): fuera de las columnas abiertas, con su
  // propia entrada al drill ordenado por fecha de inicio. Solo si hay alguno.
  if (adjCount > 0) {
    blocks.push(
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `🏁 *Adjudicados por iniciar*\n${nNegocios(adjCount)} ganado${adjCount === 1 ? "" : "s"}, aún por arrancar` },
        accessory: { type: "button", action_id: "pipe_open_adjudicados", text: pt(`🏁 Ver ${adjCount} →`) },
      },
    );
  }
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Total abierto: *${clp(total)}* · Actualizado hace un momento` }] });
  return { type: "modal", callback_id: "opai_pipeline", title: modalTitle("Pipeline"), close: pt("Cerrar"), blocks };
}

/** Carga stages + conteo de adjudicados en paralelo y arma el overview. */
async function renderOverview(tenantId: string, expanded = false): Promise<SlackView> {
  const [stages, adjCount] = await Promise.all([
    listStagesWithCounts(tenantId),
    countAdjudicados(tenantId).catch((err) => {
      console.error("[slack] pipeline: conteo de adjudicados falló (se omite la entrada):", err);
      return 0;
    }),
  ]);
  return overviewView(stages, adjCount, expanded);
}

/** Días en la etapa (siempre calculable: el fallback a `createdAt` vive en la query). */
const daysInStage = (d: Date): number => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
const dfmt = (d: Date): string => d.toLocaleDateString("es-CL");
/** URL canónica al detalle del negocio en OPAI. */
const dealOpaiUrl = (dealId: string): string => `${getCanonicalSiteUrl()}/crm/deals/${dealId}`;
/**
 * Deep-link al canal de la sala. Usa `slack.com/app_redirect` (NO `app.slack.com/
 * client/…`): el redirect abre el canal DENTRO de la app nativa de Slack, mientras
 * que la URL `app.slack.com/client` la abría como página web en el navegador. Sigue
 * siendo https, así que es válida en botones de modal (LÍMITE F21). */
const roomClientUrl = (teamId: string, channelId: string): string => `https://slack.com/app_redirect?channel=${channelId}&team=${teamId}`;
/** Semáforo de frío por días en etapa: verde <7 · 🟠 7-14 · 🔴 >14. */
const coldDot = (days: number): string => (days > 14 ? "🔴" : days >= 7 ? "🟠" : "🟢");

/**
 * Overflow de acciones por negocio. Slack limita el overflow a 5 opciones, así
 * que los links de navegación (Abrir en OPAI, Ir a la sala, WhatsApp) van como
 * botones; aquí quedan las acciones de gestión: 📞 Llamar (mini-modal con el
 * teléfono tappable — las options de overflow con `url` no son válidas dentro
 * de un modal y `tel:` no es esquema permitido, ver LÍMITE F21) + las de
 * escritura (Avanzar/Nota/Ganado/Perdido, solo si el usuario puede editar).
 */
function dealMenu(dealId: string, hasPhone: boolean, canWrite: boolean): unknown | null {
  const options: unknown[] = [];
  if (hasPhone) options.push({ text: pt("📞 Llamar"), value: `call:${dealId}` });
  if (canWrite) {
    options.push({ text: pt("⏩ Avanzar etapa"), value: `advance:${dealId}` });
    options.push({ text: pt("📝 Nota rápida"), value: `note:${dealId}` });
    options.push({ text: pt("🎉 Ganado"), value: `won:${dealId}` });
    options.push({ text: pt("💔 Perdido"), value: `lost:${dealId}` });
  }
  return options.length ? { type: "overflow", action_id: "pipe_deal_menu", options } : null;
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
  const menu = dealMenu(d.id, Boolean(normalizeWaPhone(d.contactPhone)), ctx.canWrite);
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
    Promise.all(deals.map(async (d) => [d.id, await resolveDealWaUrl(tenantId, d.id).catch(() => null)] as const)),
    openRoomsForDeals(tenantId, deals.map((d) => d.id)),
  ]);
  return drillView(stageId, stageName, deals, { teamId, canWrite, rooms, waUrls: new Map(pairs) }, notice);
}

/* ── Adjudicados por iniciar ── */

/** Días hasta el inicio del servicio (a medianoche local); negativo = ya arrancó. */
function daysUntil(d: Date): number {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  return Math.ceil((start.getTime() - Date.now()) / 86400000);
}

/** Línea de estado del inicio: emoji-semáforo + fecha + relativo (o "sin fecha"). */
function startStatus(start: Date | null): { dot: string; text: string } {
  if (!start) return { dot: "⚪", text: "sin fecha de inicio" };
  const dl = daysUntil(start);
  const rel = dl < 0 ? `inició hace ${-dl}d` : dl === 0 ? "*inicia hoy*" : `en ${dl}d`;
  // 🔴 ya debió arrancar · 🟠 arranca dentro de 7d · 🟢 más lejos.
  const dot = dl < 0 ? "🔴" : dl <= 7 ? "🟠" : "🟢";
  return { dot, text: `inicia ${dfmt(start)} · ${rel}` };
}

/**
 * Fila de UN adjudicado, layout compacto (agenda de próximos inicios):
 *   *Cuenta* — negocio                    [ Abrir → ]
 *   🟠 inicia DD-MM-AAAA · en Nd  ·  $monto  ·  📍 comuna
 *   [ 🏠 Ir a la sala | 🏠 Abrir sala ]
 *   ───────────
 * "Abrir →" (OPAI) como accessory; una sola acción de sala debajo: link al canal
 * si la sala existe, o botón para crearla (si el usuario puede editar). F21.
 */
function adjudicadoRowBlocks(d: AdjudicadoDeal, ctx: DrillCtx): unknown[] {
  const account = (d.accountName || "Cliente").trim() || "Cliente";
  const title = (d.title || "Negocio").trim() || "Negocio";
  const amount = Number.isFinite(d.amount) ? d.amount : 0;
  const roomChannel = ctx.rooms.get(d.id) ?? null;
  const start = d.serviceStartDate instanceof Date && !Number.isNaN(d.serviceStartDate.getTime()) ? d.serviceStartDate : null;
  const st = startStatus(start);
  const place = (d.commune || "").trim();
  const meta = [st.text, amount ? clp(amount) : null, place ? `📍 ${place}` : null].filter(Boolean).join("  ·  ");
  const out: unknown[] = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${account}*\n${title}` },
      accessory: { type: "button", action_id: "pipe_deal_open", url: dealOpaiUrl(d.id), text: pt("Abrir →") },
    },
    { type: "context", elements: [{ type: "mrkdwn", text: `${st.dot} ${meta}` }] },
  ];
  // Sala del negocio: link al canal si existe; si no, botón para crearla.
  const roomBtn = roomChannel
    ? { type: "button", action_id: "pipe_deal_roomlink", url: roomClientUrl(ctx.teamId, roomChannel), text: pt("🏠 Ir a la sala") }
    : ctx.canWrite
      ? { type: "button", action_id: "pipe_deal_room", value: d.id, text: pt("🏠 Abrir sala") }
      : null;
  if (roomBtn) out.push({ type: "actions", block_id: `opai_adjroom_${d.id}`, elements: [roomBtn] });
  out.push({ type: "divider" });
  return out;
}

function adjudicadosView(deals: AdjudicadoDeal[], ctx: DrillCtx, notice?: string): SlackView {
  const conFecha = deals.filter((d) => d.serviceStartDate).length;
  const blocks: unknown[] = [
    { type: "actions", block_id: "opai_pipe_nav", elements: [{ type: "button", action_id: "pipe_back", text: pt("← Pipeline") }] },
    { type: "header", text: pt(`🏁 Adjudicados por iniciar`) },
    { type: "context", elements: [{ type: "mrkdwn", text: `${nNegocios(deals.length)} · ${conFecha} con fecha · ordenados por inicio del servicio` }] },
    { type: "divider" },
  ];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });
  if (deals.length === 0) {
    blocks.push(
      { type: "section", text: { type: "mrkdwn", text: "✨ *No hay proyectos adjudicados por iniciar.*" } },
      { type: "context", elements: [{ type: "mrkdwn", text: "Cuando marques un negocio como adjudicado con su fecha de inicio, aparecerá aquí ordenado por fecha." }] },
    );
  }
  let broken = 0;
  for (const d of deals) {
    try {
      blocks.push(...adjudicadoRowBlocks(d, ctx));
    } catch (err) {
      broken += 1;
      console.error(`[slack] pipeline adjudicados: fila corrupta dealId=${d.id}:`, err);
    }
  }
  if (broken > 0) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `⚠️ ${broken} negocio(s) no se pudieron mostrar (datos incompletos — revisa los logs).` }] });
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "🔴 ya debió iniciar · 🟠 dentro de 7 días · 🟢 más adelante" }] });
  return {
    type: "modal", callback_id: "opai_pipeline_adjudicados",
    private_metadata: packMetadata({ kind: "pipeline_adjudicados" }),
    title: modalTitle("Adjudicados"), close: pt("Cerrar"), blocks,
  };
}

async function renderAdjudicados(tenantId: string, teamId: string, canWrite: boolean, notice?: string): Promise<SlackView> {
  const deals = await listAdjudicados(tenantId);
  const rooms = await openRoomsForDeals(tenantId, deals.map((d) => d.id));
  return adjudicadosView(deals, { teamId, canWrite, rooms, waUrls: new Map() }, notice);
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

const interactionTypeOption = (t: InteractionTypeMeta) => ({ text: pt(`${t.emoji} ${t.label}`), value: t.key });

/** Modal "Registrar interacción" tipificada: tipo + resumen + fecha (Fase 4). */
export function interactionView(dealId: string): SlackView {
  return {
    type: "modal", callback_id: "pipe_interaction", private_metadata: packMetadata({ kind: "pipe_interaction", dealId }),
    title: modalTitle("Registrar interacción"), submit: pt("Registrar"), close: pt("Cancelar"),
    blocks: [
      { type: "input", block_id: "itype", label: pt("Tipo"), element: { type: "static_select", action_id: "v", initial_option: interactionTypeOption(INTERACTION_TYPES[0]), options: INTERACTION_TYPES.map(interactionTypeOption) } },
      { type: "input", block_id: "note", label: pt("Resumen"), element: { type: "plain_text_input", action_id: "v", multiline: true, max_length: 2000, placeholder: pt("¿Qué pasó? Próximos pasos…") } },
      { type: "input", block_id: "idate", optional: true, label: pt("¿Cuándo ocurrió? (opcional)"), element: { type: "datepicker", action_id: "v", placeholder: pt("Fecha de la interacción") } },
    ],
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

  // 🔎 Buscar negocio (F21): apila el buscador universal sobre el pipeline.
  // Mismo patrón loading-first que pipe_open (el trigger_id perece en ~3s).
  if (action.action_id === "pipe_search") {
    if (!payload.trigger_id) return;
    const { loadingView, infoView } = await import("../modals/views");
    let viewId = "";
    try {
      ({ id: viewId } = await slackPushView(workspace.botToken, payload.trigger_id, loadingView("Buscar negocio")));
    } catch (err) {
      console.error("[slack] pipe_search: push del loading falló:", err);
      return;
    }
    try {
      const { dealSearchView } = await import("./deal-search");
      await slackUpdateView(workspace.botToken, viewId, await dealSearchView(tenantId, teamId, canWrite, "", "open"));
    } catch (err) {
      console.error("[slack] pipe_search: no se pudo renderizar el buscador:", err);
      await slackUpdateView(workspace.botToken, viewId, infoView("Buscar negocio", "⚠️ No se pudo cargar el buscador. Intenta de nuevo.")).catch(() => {});
    }
    return;
  }

  // Navegación: volver del drill a la vista de etapas (sin cerrar el modal).
  if (action.action_id === "pipe_back") {
    if (payload.view?.id) await slackUpdateView(workspace.botToken, payload.view.id, await renderOverview(tenantId));
    return;
  }

  // "…y N etapas más" (F21): re-render del overview con TODAS las etapas.
  if (action.action_id === "pipe_more") {
    if (payload.view?.id) await slackUpdateView(workspace.botToken, payload.view.id, await renderOverview(tenantId, true));
    return;
  }

  // 🏁 Adjudicados por iniciar (F21): drill aparte, ordenado por fecha de inicio.
  // Mismo patrón loading-first que pipe_open (el trigger_id perece en ~3s).
  if (action.action_id === "pipe_open_adjudicados") {
    if (!payload.trigger_id) return;
    const { loadingView, infoView } = await import("../modals/views");
    let viewId = "";
    try {
      ({ id: viewId } = await slackPushView(workspace.botToken, payload.trigger_id, loadingView("Adjudicados")));
    } catch (err) {
      console.error("[slack] pipe_open_adjudicados: push del loading falló:", err);
      return;
    }
    try {
      await slackUpdateView(workspace.botToken, viewId, await renderAdjudicados(tenantId, teamId, canWrite));
    } catch (err) {
      console.error("[slack] pipe_open_adjudicados: no se pudo renderizar:", err);
      await slackUpdateView(workspace.botToken, viewId, infoView("Adjudicados", "⚠️ No se pudo cargar los adjudicados. Intenta de nuevo — el detalle quedó en los logs.")).catch(() => {});
    }
    return;
  }

  // Abrir sala del negocio (botón) → crea/reusa la sala y refresca la vista de
  // origen (drill de etapa o lista de adjudicados, según el metadata).
  if (action.action_id === "pipe_deal_room") {
    const dealId = action.value;
    if (!dealId || !canWrite) return;
    const meta = unpackMetadata(payload.view?.private_metadata);
    const { openDealRoom } = await import("../deal-rooms/room");
    const r = await openDealRoom(tenantId, dealId, linked.adminId);
    const notice = r.ok
      ? r.alreadyExisted
        ? `🏠 La sala ya existe: <#${r.channelId}>`
        : `🏠 Sala abierta: <#${r.channelId}> — ficha viva fijada.`
      : `⚠️ ${r.error ?? "No se pudo abrir la sala."}`;
    if (payload.view?.id) {
      if (meta.kind === "pipeline_adjudicados") {
        await slackUpdateView(workspace.botToken, payload.view.id, await renderAdjudicados(tenantId, teamId, canWrite, notice));
      } else if (meta.stageId) {
        await slackUpdateView(workspace.botToken, payload.view.id, await renderDrill(tenantId, teamId, canWrite, meta.stageId, notice));
      }
    }
    return;
  }

  // Menú por deal (overflow): call (mini-modal con tel tappable) | advance | note | won | lost.
  if (action.action_id === "pipe_deal_menu") {
    const [op, dealId] = (action.selected_option?.value ?? "").split(":");
    if (!op || !dealId) return;
    if (op === "call") {
      if (!payload.trigger_id) return;
      const deal = await prisma.crmDeal.findFirst({
        where: { id: dealId, tenantId },
        select: { title: true, primaryContact: { select: { firstName: true, phone: true } } },
      });
      const phone = normalizeWaPhone(deal?.primaryContact?.phone ?? null);
      const body = phone
        ? `📞 <tel:+${phone}|Llamar a ${deal?.primaryContact?.firstName ?? "contacto"} (+${phone})>`
        : "Este negocio no tiene teléfono de contacto.";
      await slackPushView(workspace.botToken, payload.trigger_id, {
        type: "modal", title: modalTitle("Llamar"), close: pt("Cerrar"),
        blocks: [{ type: "section", text: { type: "mrkdwn", text: body } }],
      });
      return;
    }
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
  build: async (ctx: ModalOpenContext) => renderOverview(ctx.tenantId),
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

export const dealInteractionModal: ModalDef = {
  callbackId: "pipe_interaction", title: "Registrar interacción",
  requires: (perms) => canEdit(perms, "crm", "deals"),
  build: () => interactionView(""), // fallback; el open real (push) prellena el dealId
  submit: async (ctx: ModalSubmitContext) => {
    const dealId = ctx.metadata.dealId ?? "";
    const note = (ctx.state.note?.v?.value ?? "").trim();
    if (!note) return { ack: { response_action: "errors", errors: { note: "Escribe un resumen." } } };
    const rawType = ctx.state.itype?.v?.selected_option?.value ?? null;
    const interactionType = isInteractionType(rawType) ? rawType : "note";
    const occurredDate = ctx.state.idate?.v?.selected_date ?? null;
    const occurredAt = occurredDate ? new Date(`${occurredDate}T12:00:00Z`) : null;
    return {
      ...done("Registrar interacción", `${interactionLabel(interactionType)} registrada en el negocio.`),
      work: async () => {
        await addDealNote(ctx.tenantId, ctx.linked.adminId, dealId, note, interactionType, occurredAt);
        // Espejo a la sala + próxima acción (Fase 4.4). Best-effort.
        const { onDealInteractionLogged } = await import("../deal-rooms/interaction-insight");
        await onDealInteractionLogged(ctx.tenantId, dealId, ctx.linked.adminId, interactionType, note).catch(() => {});
      },
    };
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
