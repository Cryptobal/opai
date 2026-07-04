/**
 * Bandeja "Mis rendiciones" (Fase 13, lado solicitante): el usuario ve SUS
 * rendiciones (por `submitterId`), filtra por estado, abre cada una en OPAI y su
 * boleta si existe, y crea una nueva reusando el modal F5 (`opai_nueva_rendicion`).
 * Se abre desde `/opai rendiciones`, el Home y el hub (grupo Finanzas).
 */

import { prisma } from "@/lib/prisma";
import { canView } from "@/lib/permissions";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackUpdateView } from "../api";
import { packMetadata, unpackMetadata } from "./views";
import type { ModalDef, ModalOpenContext, SlackView } from "./types";

const CALLBACK = "opai_mis_rendiciones";
const pt = (t: string) => ({ type: "plain_text", text: t.slice(0, 75) });
const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

const STATUS: Record<string, { label: string; emoji: string }> = {
  DRAFT: { label: "Borrador", emoji: "📝" },
  SUBMITTED: { label: "Enviada", emoji: "📤" },
  IN_APPROVAL: { label: "En aprobación", emoji: "🕒" },
  APPROVED: { label: "Aprobada", emoji: "✅" },
  REJECTED: { label: "Rechazada", emoji: "❌" },
  PAID: { label: "Pagada", emoji: "💸" },
};
const st = (s: string) => STATUS[s] ?? { label: s, emoji: "•" };

const FILTERS = ["__all", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "PAID"];

async function build(ctx: ModalOpenContext, filter = "__all"): Promise<SlackView> {
  const site = getCanonicalSiteUrl();
  const rows = await prisma.financeRendicion.findMany({
    where: { tenantId: ctx.tenantId, submitterId: ctx.linked.adminId, ...(filter !== "__all" ? { status: filter } : {}) },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, code: true, amount: true, status: true, date: true,
      attachments: { where: { attachmentType: "RECEIPT" }, select: { publicUrl: true }, take: 1 },
    },
  });

  const blocks: unknown[] = [
    {
      type: "actions",
      block_id: "misren_top",
      elements: [
        {
          type: "static_select", action_id: "misren_filter",
          initial_option: { text: pt(filter === "__all" ? "Todas" : st(filter).label), value: filter },
          options: FILTERS.map((f) => ({ text: pt(f === "__all" ? "Todas" : st(f).label), value: f })),
        },
        { type: "button", text: pt("➕ Nueva rendición"), style: "primary", action_id: "opai_action_open", value: "opai_nueva_rendicion" },
      ],
    },
    { type: "divider" },
  ];

  if (rows.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: "No tienes rendiciones con ese filtro." } });
  }
  for (const r of rows) {
    const s = st(r.status);
    const fecha = r.date.toISOString().slice(0, 10).split("-").reverse().join("-");
    const boleta = r.attachments[0]?.publicUrl ? `  ·  <${r.attachments[0].publicUrl}|📎 Boleta>` : "";
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*${r.code}* · ${clp(r.amount)} · ${s.emoji} ${s.label} · ${fecha}${boleta}` },
      accessory: { type: "button", text: pt("Ver en OPAI"), url: `${site}/finanzas/rendiciones/${r.id}` },
    });
  }

  return {
    type: "modal", callback_id: CALLBACK,
    private_metadata: packMetadata({ kind: "misren", status: filter }),
    title: pt("Mis rendiciones"), close: pt("Cerrar"), blocks,
  };
}

export const misRendicionesModal: ModalDef = {
  callbackId: CALLBACK,
  title: "Mis rendiciones",
  requires: (perms) => canView(perms, "finance", "rendiciones"),
  requiresMessage: "Necesitas acceso a Rendiciones en Finanzas.",
  build: (ctx) => build(ctx),
  submit: async () => ({ ack: {} }),
};

/** block_action `misren_filter`: re-lista con el estado elegido. */
export async function handleMisRendicionesAction(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const view = payload.view as { id?: string; private_metadata?: string } | undefined;
  const action = (payload.actions as Array<{ action_id?: string; selected_option?: { value?: string } }> | undefined)?.[0];
  if (!teamId || !slackUserId || action?.action_id !== "misren_filter" || !view?.id) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const filter = action.selected_option?.value ?? unpackMetadata(view.private_metadata).status ?? "__all";
  const v = await build({ workspace, tenantId: workspace.tenantId, linked, slackUserId }, filter);
  await slackUpdateView(workspace.botToken, view.id, v);
}
