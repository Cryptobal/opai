/**
 * Bandeja "Mis rendiciones" (Fase 13 · gestión F20, lado solicitante): el
 * usuario ve SUS rendiciones (por `submitterId`) con chips de estado —
 * aterrizaje en *Enviadas* (el caso del 90%: "¿en qué va lo que mandé?") —,
 * cada fila con su link "Abrir en OPAI" (detalle canónico
 * `/finanzas/rendiciones/{id}`) y acciones según estado:
 *
 *  - Borrador → 🗑 Eliminar (con confirmación; misma regla que la web: solo
 *    DRAFT propio, gate canDelete finance/rendiciones, auditado) y
 *    "✏️ Completar en OPAI" (link al detalle).
 *  - Enviada / En aprobación → "↩️ Retirar" SOLO si el flujo lo permite. En el
 *    servicio real la transición SUBMITTED→DRAFT existe únicamente como
 *    reversión administrativa (capability `rendicion_configure`, ver
 *    `/api/finance/rendiciones/[id]/revert`): se cablea con ese MISMO gate
 *    (además de ser el submitter), con confirmación y registro en
 *    `FinanceRendicionHistory` (action REVERTED). Sin la capability, la fila
 *    solo ofrece el link. Eliminar duro de una ENVIADA queda excluido (está en
 *    flujo de aprobación — regla de irreversibles).
 *
 * Se abre desde `/opai rendiciones`, el Home y el hub (grupo Finanzas).
 */

import { prisma } from "@/lib/prisma";
import { canView, canDelete, hasCapability } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin, type LinkedAdmin } from "../user-link";
import { slackUpdateView } from "../api";
import { packMetadata, unpackMetadata } from "./views";
import type { ModalDef, ModalOpenContext, SlackView } from "./types";

const CALLBACK = "opai_mis_rendiciones";
const pt = (t: string) => ({ type: "plain_text", text: t.slice(0, 75), emoji: true });
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

/**
 * Chips de estado. Agrupan los estados REALES del modelo (DRAFT | SUBMITTED |
 * IN_APPROVAL | APPROVED | REJECTED | PAID): "Enviadas" incluye En aprobación
 * (sigue en flujo) y "Aprobadas" incluye Pagadas (ya aprobadas).
 */
const CHIPS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: "enviadas", label: "Enviadas", statuses: ["SUBMITTED", "IN_APPROVAL"] },
  { key: "borradores", label: "Borradores", statuses: ["DRAFT"] },
  { key: "aprobadas", label: "Aprobadas", statuses: ["APPROVED", "PAID"] },
  { key: "rechazadas", label: "Rechazadas", statuses: ["REJECTED"] },
];
const DEFAULT_CHIP = "enviadas";
const chipByKey = (key: string) => CHIPS.find((c) => c.key === key) ?? CHIPS[0];

/** ¿Puede retirar una enviada? Mismo gate que el revert administrativo de la web. */
function canWithdraw(linked: LinkedAdmin): boolean {
  return hasCapability(linked.perms, "rendicion_configure");
}

interface Row {
  id: string; code: string; amount: number; status: string; date: Date;
  attachments: Array<{ publicUrl: string | null }>;
}

function rowBlock(r: Row, linked: LinkedAdmin): unknown {
  const site = getCanonicalSiteUrl();
  const url = `${site}/finanzas/rendiciones/${r.id}`;
  const s = st(r.status);
  const fecha = r.date.toISOString().slice(0, 10).split("-").reverse().join("-");
  const boleta = r.attachments[0]?.publicUrl ? `  ·  <${r.attachments[0].publicUrl}|📎 Boleta>` : "";
  // El link de cada fila dice lo que harás allá: completar un borrador, abrir el resto.
  const link = r.status === "DRAFT" ? `<${url}|✏️ Completar en OPAI>` : `<${url}|Abrir en OPAI>`;
  const block: Record<string, unknown> = {
    type: "section",
    text: { type: "mrkdwn", text: `*${r.code}* · ${clp(r.amount)} · ${s.emoji} ${s.label} · ${fecha}\n${link}${boleta}` },
  };
  if (r.status === "DRAFT" && canDelete(linked.perms, "finance", "rendiciones")) {
    block.accessory = {
      type: "button", text: pt("🗑 Eliminar"), style: "danger",
      action_id: "misren_delete", value: r.id,
      confirm: {
        title: pt("¿Eliminar borrador?"),
        text: { type: "mrkdwn", text: `Se eliminará *${r.code}* (${clp(r.amount)}) definitivamente.` },
        confirm: pt("Eliminar"), deny: pt("Cancelar"), style: "danger",
      },
    };
  } else if ((r.status === "SUBMITTED" || r.status === "IN_APPROVAL") && canWithdraw(linked)) {
    block.accessory = {
      type: "button", text: pt("↩️ Retirar"),
      action_id: "misren_retirar", value: r.id,
      confirm: {
        title: pt("¿Retirar la rendición?"),
        text: { type: "mrkdwn", text: `*${r.code}* volverá a *Borrador* y sus aprobaciones pendientes se descartarán. Quedará registrado en el historial.` },
        confirm: pt("Retirar"), deny: pt("Cancelar"),
      },
    };
  }
  return block;
}

async function build(ctx: ModalOpenContext, chipKey = DEFAULT_CHIP, notice?: string): Promise<SlackView> {
  const chip = chipByKey(chipKey);
  const rows = await prisma.financeRendicion.findMany({
    where: { tenantId: ctx.tenantId, submitterId: ctx.linked.adminId, status: { in: chip.statuses } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, code: true, amount: true, status: true, date: true,
      attachments: { where: { attachmentType: "RECEIPT" }, select: { publicUrl: true }, take: 1 },
    },
  });

  const blocks: unknown[] = [];
  if (notice) blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: notice }] });

  blocks.push({
    type: "actions",
    block_id: "misren_chips",
    elements: CHIPS.map((c) => {
      const btn: Record<string, unknown> = { type: "button", text: pt(c.label), action_id: `misren_chip_${c.key}`, value: c.key };
      if (c.key === chip.key) btn.style = "primary";
      return btn;
    }),
  });
  blocks.push({
    type: "actions",
    block_id: "misren_new",
    elements: [{ type: "button", text: pt("➕ Nueva rendición"), style: "primary", action_id: "opai_action_open_opai_nueva_rendicion", value: "opai_nueva_rendicion" }],
  });
  blocks.push({ type: "divider" });

  if (rows.length === 0) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: `No tienes rendiciones en *${chip.label}*.` } });
  }
  for (const r of rows) blocks.push(rowBlock(r, ctx.linked));

  return {
    type: "modal", callback_id: CALLBACK,
    private_metadata: packMetadata({ kind: "misren", status: chip.key }),
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

/**
 * Elimina un borrador PROPIO (misma regla que `DELETE /api/finance/rendiciones/[id]`:
 * solo DRAFT, solo el submitter, gate canDelete). Devuelve el aviso para la vista.
 */
async function deleteDraft(tenantId: string, linked: LinkedAdmin, rendicionId: string): Promise<string> {
  if (!canDelete(linked.perms, "finance", "rendiciones")) return "⚠️ No tienes permiso para eliminar rendiciones.";
  const r = await prisma.financeRendicion.findFirst({
    where: { id: rendicionId, tenantId, submitterId: linked.adminId },
    select: { id: true, code: true, status: true },
  });
  if (!r) return "⚠️ Rendición no encontrada.";
  if (r.status !== "DRAFT") return "⚠️ Solo se pueden eliminar borradores.";
  await prisma.financeRendicion.delete({ where: { id: r.id } });
  await logAudit({
    action: "DELETE", entity: "FinanceRendicion", entityId: r.id, tenantId,
    userId: linked.adminId, details: { code: r.code, via: "slack_mis_rendiciones" },
  }).catch(() => {});
  return `🗑 Borrador *${r.code}* eliminado.`;
}

/**
 * Retira una rendición ENVIADA propia: SUBMITTED|IN_APPROVAL → DRAFT, la misma
 * transición del revert administrativo de la web (gate `rendicion_configure`),
 * con registro en FinanceRendicionHistory (action REVERTED). Las aprobaciones
 * se eliminan (al re-enviar se recrean), igual que el revert a DRAFT de la web.
 */
async function withdrawSubmitted(tenantId: string, linked: LinkedAdmin, rendicionId: string): Promise<string> {
  if (!canWithdraw(linked)) return "⚠️ No tienes permiso para retirar rendiciones enviadas.";
  const r = await prisma.financeRendicion.findFirst({
    where: { id: rendicionId, tenantId, submitterId: linked.adminId },
    select: { id: true, code: true, status: true },
  });
  if (!r) return "⚠️ Rendición no encontrada.";
  if (r.status !== "SUBMITTED" && r.status !== "IN_APPROVAL") {
    return "⚠️ Solo se puede retirar una rendición enviada o en aprobación.";
  }
  const admin = await prisma.admin.findUnique({ where: { id: linked.adminId }, select: { email: true } });
  await prisma.$transaction(async (tx) => {
    await tx.financeApproval.deleteMany({ where: { rendicionId: r.id } });
    await tx.financeRendicion.update({
      where: { id: r.id },
      data: { status: "DRAFT", submittedAt: null, rejectedAt: null, rejectionReason: null, rejectedById: null },
    });
    await tx.financeRendicionHistory.create({
      data: {
        rendicionId: r.id, action: "REVERTED", fromStatus: r.status, toStatus: "DRAFT",
        userId: linked.adminId, userName: admin?.email ?? null,
        comment: "Retirada por el solicitante desde Slack",
        metadata: { via: "slack_mis_rendiciones" },
      },
    });
  });
  await logAudit({
    action: "UPDATE", entity: "FinanceRendicion", entityId: r.id, tenantId,
    userId: linked.adminId, details: { code: r.code, transition: `${r.status}->DRAFT`, via: "slack_mis_rendiciones" },
  }).catch(() => {});
  return `↩️ *${r.code}* retirada: volvió a Borrador.`;
}

/**
 * block_actions `misren_*`: chips de estado, eliminar borrador y retirar enviada.
 * Corre en after() (ACK ya enviado); muta el MISMO modal vía views.update.
 */
export async function handleMisRendicionesAction(payload: Record<string, unknown>): Promise<void> {
  const teamId = (payload.team as { id?: string } | undefined)?.id;
  const slackUserId = (payload.user as { id?: string } | undefined)?.id;
  const view = payload.view as { id?: string; private_metadata?: string } | undefined;
  const action = (payload.actions as Array<{ action_id?: string; value?: string }> | undefined)?.[0];
  const actionId = action?.action_id ?? "";
  if (!teamId || !slackUserId || !view?.id || !actionId.startsWith("misren_")) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) return;

  const currentChip = unpackMetadata(view.private_metadata).status ?? DEFAULT_CHIP;
  let chip = currentChip;
  let notice: string | undefined;

  if (actionId.startsWith("misren_chip_")) {
    chip = action?.value ?? currentChip;
  } else if (actionId === "misren_delete" && action?.value) {
    notice = await deleteDraft(workspace.tenantId, linked, action.value);
  } else if (actionId === "misren_retirar" && action?.value) {
    notice = await withdrawSubmitted(workspace.tenantId, linked, action.value);
  } else {
    return;
  }

  const v = await build({ workspace, tenantId: workspace.tenantId, linked, slackUserId }, chip, notice);
  await slackUpdateView(workspace.botToken, view.id, v);
}
