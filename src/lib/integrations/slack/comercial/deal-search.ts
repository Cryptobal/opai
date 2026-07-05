/**
 * Buscador universal de negocios en Slack (Fase 21, B2): `/opai negocio <texto>`
 * (alias `/opai buscar negocio <texto>`), botón 🔎 en el header del pipeline y
 * acción en el hub (grupo Comercial).
 *
 * Busca por nombre del NEGOCIO, de la CUENTA o de la INSTALACIÓN (los tres
 * caminos reales del esquema — ver `findCrmDealIdsUniversalSearch`), con
 * normalización de acentos y matching parcial. Alcance por chips: Abiertos
 * (default) · 🏆 Ganados · ❌ Perdidos · Todos — un negocio CERRADO debe ser
 * encontrable (post-mortems, reactivaciones, abrir su sala).
 *
 * Cada resultado: `*Cuenta* · negocio · $monto · etapa/estado · ⏱` con
 * 🏠 Abrir sala (crea o entra, también para cerrados — reusa `openDealRoom`
 * F16) · 🔗 Abrir en OPAI · 🟢 WhatsApp si hay contacto con teléfono.
 * Gate: misma capability comercial del pipeline (ver Negocios CRM).
 */

import { prisma } from "@/lib/prisma";
import { canView, canEdit } from "@/lib/permissions";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { findCrmDealIdsUniversalSearch } from "@/lib/search-normalize";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView } from "../api";
import { packMetadata, unpackMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import { clp, resolveDealWaUrl } from "./deal-common";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (text: string) => ({ type: "plain_text", text: text.slice(0, 75), emoji: true });

export type DealSearchScope = "open" | "won" | "lost" | "all";

const SCOPES: Array<{ value: DealSearchScope; label: string }> = [
  { value: "open", label: "Abiertos" },
  { value: "won", label: "🏆 Ganados" },
  { value: "lost", label: "❌ Perdidos" },
  { value: "all", label: "Todos" },
];

function asScope(raw: string | undefined): DealSearchScope {
  return raw === "won" || raw === "lost" || raw === "all" ? raw : "open";
}

/* ── Consulta ── */

interface FoundDeal {
  id: string;
  title: string;
  amount: number;
  status: string;
  stageName: string;
  accountName: string;
  contactFirst: string | null;
  contactPhone: string | null;
  updatedAt: Date;
}

async function searchDeals(tenantId: string, query: string, scope: DealSearchScope): Promise<FoundDeal[]> {
  const ids = await findCrmDealIdsUniversalSearch({ tenantId, query, scope, limit: 10 });
  if (!ids.length) return [];
  const rows = await prisma.crmDeal.findMany({
    where: { tenantId, id: { in: ids } },
    select: {
      id: true, title: true, amount: true, status: true, updatedAt: true,
      stage: { select: { name: true } },
      account: { select: { name: true } },
      primaryContact: { select: { firstName: true, phone: true } },
    },
  });
  // Conservar el orden del SQL (updated_at DESC).
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out: FoundDeal[] = [];
  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    out.push({
      id: r.id,
      title: (r.title || "Negocio").trim() || "Negocio",
      amount: Number(r.amount ?? 0),
      status: r.status ?? "open",
      stageName: r.stage?.name ?? "Sin etapa",
      accountName: (r.account?.name || "Cliente").trim() || "Cliente",
      contactFirst: r.primaryContact?.firstName ?? null,
      contactPhone: r.primaryContact?.phone ?? null,
      updatedAt: r.updatedAt,
    });
  }
  return out;
}

/** dealId → channelId de la sala OPEN (deep-link "Ir a la sala"). */
async function openRoomsFor(tenantId: string, dealIds: string[]): Promise<Map<string, string>> {
  if (!dealIds.length) return new Map();
  const rooms = await prisma.crmDealSlackRoom.findMany({
    where: { tenantId, dealId: { in: dealIds }, status: "OPEN" },
    select: { dealId: true, slackChannelId: true },
  });
  return new Map(rooms.map((r) => [r.dealId, r.slackChannelId]));
}

/* ── Vista ── */

const dealOpaiUrl = (dealId: string): string => `${getCanonicalSiteUrl()}/crm/deals/${dealId}`;
const roomClientUrl = (teamId: string, channelId: string): string => `https://app.slack.com/client/${teamId}/${channelId}`;
const daysSince = (d: Date): number => Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));

/** Etiqueta de estado/etapa: etapa si abierto, 🏆/❌ si cerrado. */
function statusLabel(d: FoundDeal): string {
  if (d.status === "won") return "🏆 Ganado";
  if (d.status === "lost") return "❌ Perdido";
  return d.stageName;
}

interface SearchRenderCtx {
  teamId: string;
  canWrite: boolean;
  rooms: Map<string, string>;
  waUrls: Map<string, string | null>;
}

/** Bloques de UNA fila de resultado. Null-safety total (regla F21). */
function resultRowBlocks(d: FoundDeal, ctx: SearchRenderCtx): unknown[] {
  const days = d.updatedAt instanceof Date && !Number.isNaN(d.updatedAt.getTime()) ? daysSince(d.updatedAt) : null;
  const roomChannel = ctx.rooms.get(d.id) ?? null;
  const wa = ctx.waUrls.get(d.id) ?? null;
  const line = [
    `${roomChannel ? "🏠 " : ""}*${d.accountName}* · ${d.title}`,
    `${clp(d.amount)} · ${statusLabel(d)}${days !== null ? ` · ⏱ ${days}d` : ""}`,
  ].join("\n");
  const section = { type: "section", text: { type: "mrkdwn", text: line } };
  const btns: unknown[] = [];
  // 🏠 Sala: entrar si existe; crear si no (también para negocios cerrados —
  // el post-mortem de un perdido y la reactivación de un ganado viven ahí).
  if (roomChannel) btns.push({ type: "button", action_id: "dsearch_roomlink", url: roomClientUrl(ctx.teamId, roomChannel), text: pt("🏠 Ir a la sala") });
  else if (ctx.canWrite) btns.push({ type: "button", action_id: "dsearch_room", value: d.id, text: pt("🏠 Abrir sala") });
  btns.push({ type: "button", action_id: "dsearch_open", url: dealOpaiUrl(d.id), text: pt("🔗 Abrir en OPAI") });
  if (wa && /^https:\/\//.test(wa)) btns.push({ type: "button", action_id: "dsearch_wa", url: wa, text: pt("🟢 WhatsApp") });
  return [section, { type: "actions", block_id: `opai_dsearch_${d.id}`, elements: btns }];
}

/**
 * Vista completa del buscador: input + chips de alcance + resultados.
 * `q` vacío = pantalla inicial con hint. Reutilizada por build, submit y
 * los block_actions (chips / abrir sala).
 */
export async function dealSearchView(
  tenantId: string,
  teamId: string,
  canWrite: boolean,
  q: string,
  scope: DealSearchScope,
  notice?: string,
): Promise<SlackView> {
  const blocks: unknown[] = [
    {
      type: "input",
      block_id: "q",
      label: pt("Negocio, cuenta o instalación"),
      element: {
        type: "plain_text_input",
        action_id: "v",
        placeholder: pt("ej: polpaico"),
        max_length: 80,
        ...(q ? { initial_value: q.slice(0, 80) } : {}),
      },
    },
    {
      type: "actions",
      block_id: "opai_dsearch_scopes",
      elements: SCOPES.map((s) => ({
        type: "button",
        action_id: `dsearch_scope_${s.value}`,
        value: s.value,
        text: pt(s.value === scope ? `✓ ${s.label}` : s.label),
        ...(s.value === scope ? { style: "primary" } : {}),
      })),
    },
    { type: "divider" },
  ];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });

  if (!q.trim()) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: "Escribe parte del nombre y presiona *Buscar*. También encuentra por instalación (ej: el nombre de la faena)." }] });
  } else {
    let deals: FoundDeal[] = [];
    try {
      deals = await searchDeals(tenantId, q.trim(), scope);
    } catch (err) {
      console.error(`[slack] dealSearch: búsqueda falló q="${q}":`, err);
      blocks.push({ type: "section", text: { type: "mrkdwn", text: "⚠️ La búsqueda falló. Intenta de nuevo." } });
      return searchModalShell(q, scope, blocks);
    }
    if (!deals.length) {
      const scopeHint = scope === "open" ? "\n💡 Puede estar cerrado: prueba el chip *Todos*." : "";
      blocks.push({ type: "section", text: { type: "mrkdwn", text: `Sin resultados para *${q.trim().slice(0, 60)}*. Prueba con parte del nombre de la cuenta o de la instalación.${scopeHint}` } });
    } else {
      const [pairs, rooms] = await Promise.all([
        Promise.all(deals.map(async (d) => [d.id, await resolveDealWaUrl(tenantId, d.id).catch(() => null)] as const)),
        openRoomsFor(tenantId, deals.map((d) => d.id)),
      ]);
      const ctx: SearchRenderCtx = { teamId, canWrite, rooms, waUrls: new Map(pairs) };
      for (const d of deals) {
        // Blindaje por fila (F21): una fila corrupta se salta con log.
        try {
          blocks.push(...resultRowBlocks(d, ctx));
        } catch (err) {
          console.error(`[slack] dealSearch: fila corrupta dealId=${d.id}:`, err);
        }
      }
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `${deals.length} resultado(s) · máx 10 · alcance: ${SCOPES.find((s) => s.value === scope)?.label ?? scope}` }] });
    }
  }
  return searchModalShell(q, scope, blocks);
}

function searchModalShell(q: string, scope: DealSearchScope, blocks: unknown[]): SlackView {
  return {
    type: "modal",
    callback_id: "opai_negocio",
    private_metadata: packMetadata({ kind: "deal_search", q: q.slice(0, 200), dscope: scope }),
    title: modalTitle("Buscar negocio"),
    submit: pt("Buscar"),
    close: pt("Cerrar"),
    blocks,
  };
}

/* ── Dispatch de block_actions (chips de alcance · abrir sala) ── */

export async function handleDealSearchAction(payload: {
  team?: { id?: string }; user?: { id?: string }; trigger_id?: string;
  view?: { id?: string; private_metadata?: string; state?: { values?: Record<string, Record<string, { value?: string }>> } };
  actions?: Array<{ action_id?: string; value?: string }>;
}): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const action = payload.actions?.[0];
  const viewId = payload.view?.id;
  if (!teamId || !slackUserId || !action?.action_id || !viewId) return;
  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !canView(linked.perms, "crm", "deals")) return;
  const tenantId = workspace.tenantId;
  const canWrite = canEdit(linked.perms, "crm", "deals");

  const meta = unpackMetadata(payload.view?.private_metadata);
  // El texto vigente: lo TIPEADO en el input (view.state) manda sobre lo buscado.
  const typed = payload.view?.state?.values?.q?.v?.value;
  const q = (typeof typed === "string" && typed.trim() ? typed : meta.q ?? "").trim();
  const scope = asScope(meta.dscope);

  const rerender = async (nextQ: string, nextScope: DealSearchScope, notice?: string) => {
    try {
      await slackUpdateView(workspace.botToken, viewId, await dealSearchView(tenantId, teamId, canWrite, nextQ, nextScope, notice));
    } catch (err) {
      console.error("[slack] dealSearch: views.update falló:", err);
    }
  };

  // Chips de alcance: re-buscar con el texto vigente y el nuevo estado.
  if (action.action_id.startsWith("dsearch_scope_")) {
    await rerender(q, asScope(action.value));
    return;
  }

  // 🏠 Abrir sala (crea o entra — también para negocios cerrados).
  if (action.action_id === "dsearch_room") {
    const dealId = action.value;
    if (!dealId || !canWrite) return;
    const { openDealRoom } = await import("../deal-rooms/room");
    const r = await openDealRoom(tenantId, dealId, linked.adminId);
    const notice = r.ok
      ? r.alreadyExisted
        ? `🏠 La sala ya existe: <#${r.channelId}>`
        : `🏠 Sala abierta: <#${r.channelId}> — ficha viva fijada.`
      : `⚠️ ${r.error ?? "No se pudo abrir la sala."}`;
    await rerender(q, scope, notice);
    return;
  }
}

/* ── ModalDef ── */

export const dealSearchModal: ModalDef = {
  callbackId: "opai_negocio",
  title: "Buscar negocio",
  requires: (perms) => canView(perms, "crm", "deals"),
  requiresMessage: "Necesitas acceso a Negocios (CRM).",
  build: async (ctx: ModalOpenContext) =>
    dealSearchView(ctx.tenantId, ctx.workspace.slackTeamId, canEdit(ctx.linked.perms, "crm", "deals"), (ctx.arg ?? "").trim(), "open"),
  submit: async (ctx: ModalSubmitContext): Promise<ModalSubmitResult> => {
    const q = (ctx.state.q?.v?.value ?? "").trim();
    if (!q) return { ack: { response_action: "errors", errors: { q: "Escribe algo para buscar." } } };
    const scope = asScope(ctx.metadata.dscope);
    const view = await dealSearchView(ctx.tenantId, ctx.workspace.slackTeamId, canEdit(ctx.linked.perms, "crm", "deals"), q, scope);
    return { ack: { response_action: "update", view } };
  },
};
