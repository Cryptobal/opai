/**
 * Modal Slack para editar la fecha de inicio de un negocio adjudicado.
 * Reutilizable desde App Home, pipeline adjudicados y tarjetas de alerta.
 */

import { prisma } from "@/lib/prisma";
import { canEdit } from "@/lib/permissions";
import { updateDealStartDate } from "@/lib/crm/update-deal-start-date";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { resolveLinkedAdmin } from "../user-link";
import { slackOpenView, slackPushView } from "../api";
import { packMetadata } from "../modals/views";
import { modalTitle } from "../modals/title";
import { publishHome } from "../home";
import type { ModalDef, ModalOpenContext, ModalSubmitContext, ModalSubmitResult, SlackView } from "../modals/types";

const pt = (t: string) => ({ type: "plain_text", text: t.slice(0, 75), emoji: true });

export async function editStartDateView(tenantId: string, dealId: string): Promise<SlackView> {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, tenantId },
    select: { serviceStartDate: true, title: true, account: { select: { name: true } } },
  });
  const initial = deal?.serviceStartDate && !Number.isNaN(deal.serviceStartDate.getTime())
    ? deal.serviceStartDate.toISOString().slice(0, 10)
    : undefined;
  const hint = deal ? `${(deal.account?.name || "Cliente").trim()} · ${(deal.title || "Negocio").trim()}` : "";
  return {
    type: "modal",
    callback_id: "pipe_start_date",
    private_metadata: packMetadata({ kind: "pipe_start_date", dealId }),
    title: modalTitle("Fecha de inicio"),
    submit: pt("Guardar"),
    close: pt("Cancelar"),
    blocks: [
      ...(hint ? [{ type: "context", elements: [{ type: "mrkdwn", text: hint }] }] : []),
      {
        type: "input",
        block_id: "sdate",
        label: pt("Inicio del servicio"),
        element: {
          type: "datepicker",
          action_id: "v",
          placeholder: pt("Selecciona fecha"),
          ...(initial ? { initial_date: initial } : {}),
        },
      },
    ],
  };
}

function done(msg: string): ModalSubmitResult {
  return {
    ack: {
      response_action: "update",
      view: {
        type: "modal",
        title: { type: "plain_text", text: "Fecha de inicio" },
        close: { type: "plain_text", text: "Listo" },
        blocks: [{ type: "section", text: { type: "mrkdwn", text: msg } }],
      },
    },
  };
}

/** Abre el modal: push si ya hay modal en pila, open si no (App Home / canal). */
export async function openStartDateModal(
  botToken: string,
  triggerId: string,
  tenantId: string,
  dealId: string,
  stacked: boolean,
): Promise<void> {
  const view = await editStartDateView(tenantId, dealId);
  const open = stacked ? slackPushView : slackOpenView;
  await open(botToken, triggerId, view).catch((e) => console.error("[slack] openStartDateModal falló:", e));
}

export async function handleStartDateOpenAction(payload: {
  team?: { id?: string };
  user?: { id?: string };
  trigger_id?: string;
  view?: { type?: string };
  actions?: Array<{ action_id?: string; value?: string }>;
}, actionId: string, stacked: boolean): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const dealId = payload.actions?.[0]?.value;
  if (!teamId || !slackUserId || !dealId || !payload.trigger_id || payload.actions?.[0]?.action_id !== actionId) return;
  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !canEdit(linked.perms, "crm", "deals")) return;
  await openStartDateModal(workspace.botToken, payload.trigger_id, workspace.tenantId, dealId, stacked || payload.view?.type === "modal");
}

export const dealStartDateModal: ModalDef = {
  callbackId: "pipe_start_date",
  title: "Fecha de inicio",
  requires: (perms) => canEdit(perms, "crm", "deals"),
  build: async (ctx: ModalOpenContext) => editStartDateView(ctx.tenantId, ""),
  submit: async (ctx: ModalSubmitContext): Promise<ModalSubmitResult> => {
    const dealId = ctx.metadata.dealId ?? "";
    const raw = ctx.state.sdate?.v?.selected_date;
    if (!raw) return { ack: { response_action: "errors", errors: { sdate: "Elige una fecha." } } };
    const r = await updateDealStartDate({
      tenantId: ctx.tenantId,
      userId: ctx.linked.adminId,
      dealId,
      serviceStartDate: raw,
    });
    if (r.kind !== "ok") return done("⚠️ No se pudo actualizar la fecha.");
    const chile = new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(`${raw}T12:00:00Z`));
    return {
      ...done(`📅 Fecha de inicio actualizada: *${chile}*\n_Sincronizado con OPAI._`),
      work: async () => { await publishHome(ctx.tenantId, ctx.slackUserId).catch(() => {}); },
    };
  },
};
