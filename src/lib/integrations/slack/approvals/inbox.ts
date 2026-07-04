/**
 * Bandeja de aprobaciones UNIFICADA (Fase 13): 🎫 Tickets · 🧾 Rendiciones ·
 * ⏱ Turnos extra en un solo modal (`opai_aprobaciones`). Solo se muestran las
 * secciones que el usuario puede aprobar y que tienen pendientes. Cada fila trae
 * Aprobar (inline) / Rechazar (motivo obligatorio → views.push). Paginación por
 * sección. Aislamiento: tenant por team_id, identidad por vínculo, capability real.
 */

import type { RolePermissions } from "@/lib/permissions";
import { hasCapability } from "@/lib/permissions";
import { listRendicionesPendingApproval, countRendicionesPendingApproval } from "@/lib/rendiciones-approvals";
import { listPendingTes, countPendingTes } from "@/lib/te-approvals";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { packMetadata } from "../modals/views";
import { listMyApprovals, countMyApprovals } from "../tickets/approvals";
import type { ModalDef, ModalOpenContext, SlackView } from "../modals/types";

export const PAGE = 6;
const pt = (t: string) => ({ type: "plain_text", text: t.slice(0, 75) });
const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

export type Pages = { ticket: number; rendicion: number; te: number };
export function parsePages(raw?: string): Pages {
  const [t, r, e] = (raw ?? "1-1-1").split("-").map((x) => parseInt(x, 10) || 1);
  return { ticket: t, rendicion: r, te: e };
}
const packPages = (p: Pages) => `${p.ticket}-${p.rendicion}-${p.te}`;

export async function countInbox(tenantId: string, adminId: string, perms: RolePermissions): Promise<number> {
  const [tk, rn, te] = await Promise.all([
    countMyApprovals(tenantId, adminId),
    hasCapability(perms, "rendicion_approve") ? countRendicionesPendingApproval(tenantId, adminId) : Promise.resolve(0),
    hasCapability(perms, "te_approve") ? countPendingTes(tenantId) : Promise.resolve(0),
  ]);
  return tk + rn + te;
}

function rowBlocks(title: string, domain: string, id: string, label: string): unknown[] {
  return [
    { type: "section", text: { type: "mrkdwn", text: title } },
    {
      type: "actions",
      block_id: `apx_row_${domain}_${id}`,
      elements: [
        { type: "button", text: pt("Aprobar"), style: "primary", action_id: "apx_approve", value: `${domain}:${id}` },
        { type: "button", text: pt("Rechazar"), style: "danger", action_id: "apx_reject", value: `${domain}:${id}:${label}` },
      ],
    },
  ];
}

function pager(domain: string, page: number, hasNext: boolean): unknown | null {
  if (page <= 1 && !hasNext) return null;
  const els: unknown[] = [];
  if (page > 1) els.push({ type: "button", text: pt("‹ Anterior"), action_id: "apx_page", value: `${domain}:prev` });
  if (hasNext) els.push({ type: "button", text: pt("Siguiente ›"), action_id: "apx_page", value: `${domain}:next` });
  return { type: "actions", block_id: `apx_pg_${domain}`, elements: els };
}

export async function buildInboxView(tenantId: string, adminId: string, perms: RolePermissions, pages: Pages, notice?: string): Promise<SlackView> {
  const site = getCanonicalSiteUrl();
  const blocks: unknown[] = [];
  if (notice) blocks.push({ type: "section", text: { type: "mrkdwn", text: notice } }, { type: "divider" });

  // 🎫 Tickets (por asignación / grupo del paso actual)
  const tickets = await listMyApprovals(tenantId, adminId, { skip: (pages.ticket - 1) * PAGE, take: PAGE + 1 });
  const tkHasNext = tickets.length > PAGE;
  const tk = tickets.slice(0, PAGE);
  if (tk.length) {
    blocks.push({ type: "header", text: pt("🎫 Tickets") });
    for (const t of tk) {
      const sla = t.slaBreached ? "  ·  🔴 SLA vencido" : "";
      blocks.push(...rowBlocks(`<${site}/ops/tickets/${t.id}|${t.code}> · ${t.title}\n\`${t.priority}\`${sla}`, "ticket", t.id, t.code));
    }
    const pg = pager("ticket", pages.ticket, tkHasNext); if (pg) blocks.push(pg);
  }

  // 🧾 Rendiciones (por aprobación asignada)
  if (hasCapability(perms, "rendicion_approve")) {
    const rens = await listRendicionesPendingApproval(tenantId, adminId, { skip: (pages.rendicion - 1) * PAGE, take: PAGE + 1 });
    const rnNext = rens.length > PAGE;
    const rn = rens.slice(0, PAGE);
    if (rn.length) {
      blocks.push({ type: "header", text: pt("🧾 Rendiciones") });
      for (const r of rn) {
        const cat = r.categoria ? ` · ${r.categoria}` : "";
        blocks.push(...rowBlocks(`<${site}/finanzas/rendiciones/${r.id}|${r.code}> · ${clp(r.amount)} · ${r.submitterName}${cat}`, "rendicion", r.id, r.code));
      }
      const pg = pager("rendicion", pages.rendicion, rnNext); if (pg) blocks.push(pg);
    }
  }

  // ⏱ Turnos extra (todos los pending del tenant si tengo te_approve)
  if (hasCapability(perms, "te_approve")) {
    const tes = await listPendingTes(tenantId, { skip: (pages.te - 1) * PAGE, take: PAGE + 1 });
    const teNext = tes.length > PAGE;
    const te = tes.slice(0, PAGE);
    if (te.length) {
      blocks.push({ type: "header", text: pt("⏱ Turnos extra") });
      for (const t of te) {
        const iso = t.date.toISOString().slice(0, 10);
        const fecha = iso.slice(5).split("-").reverse().join("-");
        const url = `${site}/ops/turnos-extra/aprobaciones?te=${t.id}&ym=${iso.slice(0, 7)}`;
        blocks.push(...rowBlocks(`<${url}|TE> · ${clp(t.amountClp)} · ${t.guardiaNombre} · ${t.instalacion} · ${fecha}`, "te", t.id, "TE"));
      }
      const pg = pager("te", pages.te, teNext); if (pg) blocks.push(pg);
    }
  }

  if (blocks.length === 0) blocks.push({ type: "section", text: { type: "mrkdwn", text: "No tienes aprobaciones pendientes. 🎉" } });

  return { type: "modal", callback_id: "opai_aprobaciones", private_metadata: packMetadata({ kind: "apx_inbox", page: packPages(pages) }), title: pt("Aprobaciones"), close: pt("Cerrar"), blocks };
}

async function build(ctx: ModalOpenContext): Promise<SlackView> {
  return buildInboxView(ctx.tenantId, ctx.linked.adminId, ctx.linked.perms, { ticket: 1, rendicion: 1, te: 1 });
}

export const inboxModal: ModalDef = {
  callbackId: "opai_aprobaciones",
  title: "Aprobaciones",
  build,
  submit: async () => ({ ack: {} }),
};
