/**
 * Abre el modal de "Asignar centro de costo" a un DTE recibido desde Slack.
 *
 * VÍA A (elegida): UN solo `static_select` con `option_groups`, donde cada grupo
 * es un cliente CRM y cada opción una instalación activa; el `value` codifica
 * `crmAccountId|installationId`. Sin encadenado dinámico → sin `external_select`
 * (que falla con "Ocurrió un problema al cargar las opciones"). Slack admite
 * ~100 opciones por select: si el catálogo del tenant las supera, truncamos con
 * aviso visible (NO silencioso) y el resto se asigna desde la web. Para pasar a
 * la Vía B (2 pasos) haría falta que un tenant supere ese tope de forma estable.
 */

import { prisma } from "@/lib/prisma";
import { hasCapability } from "@/lib/permissions";
import { slackOpenView } from "../api";
import { modalTitle } from "../modals/title";
import { dteTypeLabel } from "../dte-received-blocks";
import { loadDteForBlocks } from "../dte-received-load";
import {
  resolveDteReceivedActor,
  ephemeral,
  type DteReceivedPayload,
} from "./dte-received-context";

export const COSTCENTER_CALLBACK_ID = "dterecv_costcenter_assign";
const MAX_TOTAL_OPTIONS = 100; // tope práctico de un static_select en Slack.
const pt = (t: string) => ({ type: "plain_text" as const, text: t.slice(0, 75), emoji: true });

export async function handleDteCostCenterOpen(payload: DteReceivedPayload): Promise<void> {
  const actor = await resolveDteReceivedActor(payload);
  if (!actor || !payload.trigger_id) return;

  // Mismo gate que el endpoint web: facturacion_manage.
  if (!hasCapability(actor.perms, "facturacion_manage")) {
    await ephemeral(payload.response_url, "No tenés permiso para asignar centro de costo.");
    return;
  }

  const dteId = payload.actions?.[0]?.value;
  if (!dteId) return;
  const dte = await loadDteForBlocks(actor.tenantId, dteId); // revalida DTE↔tenant
  if (!dte) {
    await ephemeral(payload.response_url, "DTE no encontrado.");
    return;
  }

  // Instalaciones activas del tenant, agrupadas por cliente (Vía A).
  const installations = await prisma.crmInstallation.findMany({
    where: { tenantId: actor.tenantId, isActive: true, accountId: { not: null } },
    select: { id: true, name: true, accountId: true },
    orderBy: [{ name: "asc" }],
  });
  if (installations.length === 0) {
    await ephemeral(
      payload.response_url,
      "No hay instalaciones activas para asignar. Creá o activá una desde CRM.",
    );
    return;
  }

  const accountIds = [...new Set(installations.map((i) => i.accountId as string))];
  const accounts = await prisma.crmAccount.findMany({
    where: { tenantId: actor.tenantId, id: { in: accountIds } },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }],
  });

  let total = 0;
  let truncated = false;
  const optionGroups: Array<{ label: ReturnType<typeof pt>; options: Array<{ text: ReturnType<typeof pt>; value: string }> }> = [];
  for (const acc of accounts) {
    if (total >= MAX_TOTAL_OPTIONS) {
      truncated = true;
      break;
    }
    const opts = installations
      .filter((i) => i.accountId === acc.id)
      .map((i) => ({ text: pt(i.name), value: `${acc.id}|${i.id}` }));
    const slice = opts.slice(0, MAX_TOTAL_OPTIONS - total);
    if (slice.length < opts.length) truncated = true;
    if (slice.length > 0) {
      optionGroups.push({ label: pt(acc.name), options: slice });
      total += slice.length;
    }
  }

  const headerLine = `${dteTypeLabel(dte.dteType)} *F-${dte.folio}* · ${dte.issuerName}`;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: headerLine } },
  ];
  if (truncated) {
    blocks.push({
      type: "context",
      elements: [{
        type: "mrkdwn",
        text: `Mostrando las primeras ${MAX_TOTAL_OPTIONS} instalaciones — el resto se asigna desde la web.`,
      }],
    });
  }
  blocks.push({
    type: "input",
    block_id: "costcenter",
    label: pt("Cliente e instalación"),
    element: {
      type: "static_select",
      action_id: "v",
      placeholder: pt("Elegí una instalación…"),
      option_groups: optionGroups,
    },
  });

  const view = {
    type: "modal",
    callback_id: COSTCENTER_CALLBACK_ID,
    title: modalTitle("Centro de costo"),
    submit: pt("Asignar"),
    close: pt("Cancelar"),
    private_metadata: JSON.stringify({
      dteId,
      channelId: payload.container?.channel_id ?? "",
      messageTs: payload.container?.message_ts ?? payload.message?.ts ?? "",
    }),
    blocks,
  };

  await slackOpenView(actor.workspace.botToken, payload.trigger_id, view).catch((e) =>
    console.error("[dterecv] views.open (centro de costo) falló:", e),
  );
}
