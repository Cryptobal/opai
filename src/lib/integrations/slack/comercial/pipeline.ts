/**
 * Pipeline vivo en Slack (Fase 15, B4): `/opai pipeline`.
 *
 * Overview por etapa (nombre · N negocios · Σ CLP) → drill a la etapa → deals
 * (cliente · monto · días en etapa · última actividad) con acciones: Avanzar
 * etapa · 🟢 WhatsApp · 📝 Nota rápida · 🎉 Ganado · 💔 Perdido (motivo).
 * El cambio de etapa usa el servicio real (changeDealStage → CrmDealStageHistory;
 * al ganar emite deal_won → tarjeta 🎉 al canal).
 */

import { prisma } from "@/lib/prisma";
import { canView, canEdit } from "@/lib/permissions";
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
  id: string; amount: number; updatedAt: Date; accountName: string;
  contactFirst: string | null; contactPhone: string | null; enteredAt: Date | null;
}

async function listDealsInStage(tenantId: string, stageId: string): Promise<{ stageName: string; deals: DrillDeal[] }> {
  const [stage, deals] = await Promise.all([
    prisma.crmPipelineStage.findFirst({ where: { id: stageId, tenantId }, select: { name: true } }),
    prisma.crmDeal.findMany({
      where: { tenantId, stageId, status: "open" }, orderBy: { updatedAt: "desc" }, take: 15,
      select: { id: true, amount: true, updatedAt: true, account: { select: { name: true } }, primaryContact: { select: { firstName: true, phone: true } } },
    }),
  ]);
  const hist = deals.length
    ? await prisma.crmDealStageHistory.findMany({ where: { tenantId, dealId: { in: deals.map((d) => d.id) }, toStageId: stageId }, orderBy: { changedAt: "desc" }, select: { dealId: true, changedAt: true } })
    : [];
  const enteredAt = new Map<string, Date>();
  for (const h of hist) if (!enteredAt.has(h.dealId)) enteredAt.set(h.dealId, h.changedAt);
  return {
    stageName: stage?.name ?? "Etapa",
    deals: deals.map((d) => ({
      id: d.id, amount: Number(d.amount ?? 0), updatedAt: d.updatedAt, accountName: d.account?.name ?? "Cliente",
      contactFirst: d.primaryContact?.firstName ?? null, contactPhone: d.primaryContact?.phone ?? null, enteredAt: enteredAt.get(d.id) ?? null,
    })),
  };
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

const daysAgo = (d: Date | null): string => (d ? `${Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000))}d` : "—");
const dfmt = (d: Date): string => d.toLocaleDateString("es-CL");

function dealMenu(dealId: string): unknown {
  return {
    type: "overflow", action_id: "pipe_deal_menu",
    options: [
      { text: pt("⏩ Avanzar etapa"), value: `advance:${dealId}` },
      { text: pt("📝 Nota rápida"), value: `note:${dealId}` },
      { text: pt("🎉 Ganado"), value: `won:${dealId}` },
      { text: pt("💔 Perdido"), value: `lost:${dealId}` },
    ],
  };
}

function drillView(stageId: string, stageName: string, deals: DrillDeal[], waUrls: Map<string, string | null>, notice?: string): SlackView {
  const blocks: unknown[] = [];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });
  if (deals.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "No hay negocios abiertos en esta etapa." } });
  }
  for (const d of deals) {
    const wa = waUrls.get(d.id) ?? null;
    const section: Record<string, unknown> = {
      type: "section",
      text: { type: "mrkdwn", text: `*${d.accountName}* · ${clp(d.amount)}\n⏱ ${daysAgo(d.enteredAt)} en etapa · act ${dfmt(d.updatedAt)}` },
      accessory: dealMenu(d.id),
    };
    blocks.push(section);
    if (wa) blocks.push({ type: "actions", block_id: `opai_dealwa_${d.id}`, elements: [{ type: "button", action_id: "pipe_deal_wa", url: wa, text: pt("🟢 WhatsApp") }] });
  }
  return {
    type: "modal", callback_id: "opai_pipeline_stage",
    private_metadata: packMetadata({ kind: "pipeline_stage", stageId }),
    title: modalTitle(stageName), close: pt("Cerrar"), blocks,
  };
}

async function renderDrill(tenantId: string, stageId: string, notice?: string): Promise<SlackView> {
  const { stageName, deals } = await listDealsInStage(tenantId, stageId);
  const pairs = await Promise.all(deals.map(async (d) => [d.id, await resolveDealWaUrl(tenantId, { contactPhone: d.contactPhone, contactFirst: d.contactFirst, accountName: d.accountName }).catch(() => null)] as const));
  return drillView(stageId, stageName, deals, new Map(pairs), notice);
}

/* ── Modales secundarios (Avanzar / Nota / Perdido) ── */

async function advanceView(tenantId: string, dealId: string): Promise<SlackView> {
  const stages = await prisma.crmPipelineStage.findMany({ where: { tenantId, isActive: true }, orderBy: { order: "asc" }, select: { id: true, name: true } });
  return {
    type: "modal", callback_id: "pipe_advance", private_metadata: packMetadata({ kind: "pipe_advance", dealId }),
    title: modalTitle("Avanzar etapa"), submit: pt("Mover"), close: pt("Cancelar"),
    blocks: [{ type: "input", block_id: "stage", label: pt("Nueva etapa"), element: { type: "static_select", action_id: "v", options: stages.map((s) => ({ text: pt(s.name), value: s.id })) } }],
  };
}

function noteView(dealId: string): SlackView {
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

  // Overview → drill.
  if (action.action_id === "pipe_open") {
    if (!action.value || !payload.trigger_id) return;
    await slackPushView(workspace.botToken, payload.trigger_id, await renderDrill(tenantId, action.value));
    return;
  }

  // Menú por deal (overflow): advance | note | won | lost.
  if (action.action_id === "pipe_deal_menu") {
    const [op, dealId] = (action.selected_option?.value ?? "").split(":");
    if (!op || !dealId) return;
    if (!canWrite) return;
    const stageId = unpackMetadata(payload.view?.private_metadata).stageId ?? "";
    if (op === "advance") { if (payload.trigger_id) await slackPushView(workspace.botToken, payload.trigger_id, await advanceView(tenantId, dealId)); return; }
    if (op === "note") { if (payload.trigger_id) await slackPushView(workspace.botToken, payload.trigger_id, noteView(dealId)); return; }
    if (op === "lost") { if (payload.trigger_id) await slackPushView(workspace.botToken, payload.trigger_id, lostView(dealId)); return; }
    if (op === "won") {
      const r = await markDealWon(tenantId, linked.adminId, dealId);
      if (payload.view?.id && stageId) await slackUpdateView(workspace.botToken, payload.view.id, await renderDrill(tenantId, stageId, r.ok ? "🎉 Negocio marcado como ganado." : `⚠️ ${r.error}`));
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
