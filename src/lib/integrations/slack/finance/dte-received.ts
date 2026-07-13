import { logAudit } from "@/lib/audit";
import { buildEmailUrl } from "@/lib/emails/site-url";
import { prisma } from "@/lib/prisma";
import { formatCLP } from "@/lib/utils";
import { hasFacturacionCapability } from "@/lib/permissions";
import { notify } from "@/lib/notifications/notify";
import { applyAcuse, type AcuseUserAction } from "@/modules/finance/billing/dte-received-acuse.service";
import { getDteTypeName } from "@/modules/finance/shared/constants/dte-types";
import { slackRespondUrl, slackUpdateMessage } from "../api";
import type { ModalDef, ViewState } from "../modals/types";
import { packMetadata } from "../modals/views";
import { getTenantForTeam, getWorkspaceForTenant } from "../workspace";
import { buildLinkPrompt, resolveLinkedAdmin } from "../user-link";

const CALLBACK_ID = "opai_dte_cost_center";
const DETAIL_PATH = "/finanzas/facturacion/recibidos";

type CardDte = {
  id: string;
  dteType: number;
  folio: number;
  date: Date;
  issuerName: string;
  issuerRut: string;
  totalAmount: { toNumber(): number };
  receptionStatus: string | null;
  crmAccountId: string | null;
  installationId: string | null;
};

const ACTION_BY_ID: Record<string, AcuseUserAction> = {
  dteacuse_accept: "ACCEPT",
  dteacuse_claim_content: "CLAIM_CONTENT",
  dteacuse_claim_partial: "CLAIM_PARTIAL",
  dteacuse_claim_total: "CLAIM_TOTAL",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING_REVIEW: "Pendiente de acuse",
  ACCEPTED: "Aceptado",
  CLAIMED: "Reclamado",
  PARTIAL_CLAIM: "Reclamo parcial",
};

function clip(value: string, max = 75): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function confirmation(text: string): Record<string, unknown> {
  return {
    title: { type: "plain_text", text: "Confirmar acción SII" },
    text: { type: "mrkdwn", text },
    confirm: { type: "plain_text", text: "Confirmar" },
    deny: { type: "plain_text", text: "Cancelar" },
    style: "danger",
  };
}

async function loadCardData(tenantId: string, dteId: string): Promise<{
  dte: CardDte;
  accountName: string | null;
  installationName: string | null;
} | null> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId, direction: "RECEIVED" },
    select: {
      id: true,
      dteType: true,
      folio: true,
      date: true,
      issuerName: true,
      issuerRut: true,
      totalAmount: true,
      receptionStatus: true,
      crmAccountId: true,
      installationId: true,
    },
  });
  if (!dte) return null;

  const [account, installation] = await Promise.all([
    dte.crmAccountId
      ? prisma.crmAccount.findFirst({
          where: { id: dte.crmAccountId, tenantId },
          select: { name: true, legalName: true },
        })
      : null,
    dte.installationId
      ? prisma.crmInstallation.findFirst({
          where: { id: dte.installationId, tenantId },
          select: { name: true },
        })
      : null,
  ]);

  return {
    dte,
    accountName: account?.legalName ?? account?.name ?? null,
    installationName: installation?.name ?? null,
  };
}

export async function buildReceivedDteSlackCard(
  tenantId: string,
  dteId: string,
): Promise<{ text: string; blocks: unknown[]; title: string; link: string } | null> {
  const loaded = await loadCardData(tenantId, dteId);
  if (!loaded) return null;
  const { dte, accountName, installationName } = loaded;
  const typeName = getDteTypeName(dte.dteType);
  const title = `${typeName} N° ${dte.folio}`;
  const text = `Nuevo DTE recibido: ${title} de ${dte.issuerName}, ${formatCLP(dte.totalAmount.toNumber())}`;
  const link = `${DETAIL_PATH}?openDteId=${encodeURIComponent(dte.id)}`;
  const costCenter = accountName
    ? `${accountName}${installationName ? ` · ${installationName}` : ""}`
    : "Sin asignar";

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "🧾 Nuevo DTE recibido", emoji: true },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: `*${title}*` },
      fields: [
        { type: "mrkdwn", text: `*Emisor*\n${dte.issuerName}` },
        { type: "mrkdwn", text: `*RUT*\n${dte.issuerRut}` },
        { type: "mrkdwn", text: `*Fecha*\n${formatDate(dte.date)}` },
        { type: "mrkdwn", text: `*Monto total*\n${formatCLP(dte.totalAmount.toNumber())}` },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `*Recepción:* ${STATUS_LABELS[dte.receptionStatus ?? ""] ?? dte.receptionStatus ?? "Pendiente"}  ·  *Centro de costo:* ${costCenter}`,
        },
      ],
    },
  ];

  if (dte.receptionStatus === "PENDING_REVIEW") {
    blocks.push({
      type: "actions",
      block_id: `dte_acuse_${dte.id}`,
      elements: [
        {
          type: "button",
          action_id: "dteacuse_accept",
          value: dte.id,
          text: { type: "plain_text", text: "Aceptar", emoji: true },
          style: "primary",
          confirm: confirmation("Se enviará ACD + ERM al SII. Esta decisión no es reversible."),
        },
        {
          type: "button",
          action_id: "dteacuse_claim_content",
          value: dte.id,
          text: { type: "plain_text", text: "Reclamar contenido", emoji: true },
          style: "danger",
          confirm: confirmation("Se enviará un reclamo por contenido (RCD) al SII. Esta decisión no es reversible."),
        },
        {
          type: "button",
          action_id: "dteacuse_claim_partial",
          value: dte.id,
          text: { type: "plain_text", text: "Falta parcial", emoji: true },
          confirm: confirmation("Se enviará un reclamo por falta parcial (RFP) al SII. Esta decisión no es reversible."),
        },
        {
          type: "button",
          action_id: "dteacuse_claim_total",
          value: dte.id,
          text: { type: "plain_text", text: "Falta total", emoji: true },
          style: "danger",
          confirm: confirmation("Se enviará un reclamo por falta total (RFT) al SII. Esta decisión no es reversible."),
        },
      ],
    });
  }

  blocks.push({
    type: "actions",
    block_id: `dte_manage_${dte.id}`,
    elements: [
      {
        type: "button",
        action_id: "dtecc_open",
        value: dte.id,
        text: { type: "plain_text", text: accountName ? "Cambiar centro de costo" : "Vincular centro de costo", emoji: true },
      },
      {
        type: "button",
        action_id: "dte_open_opai",
        url: buildEmailUrl(link),
        text: { type: "plain_text", text: "Ver en OPAI", emoji: true },
      },
    ],
  });

  return { text, blocks, title, link };
}

export async function notifyReceivedDte(tenantId: string, dteId: string): Promise<void> {
  const card = await buildReceivedDteSlackCard(tenantId, dteId);
  if (!card) return;
  await notify({
    tenantId,
    type: "dte_received",
    title: `Nuevo DTE recibido · ${card.title}`,
    body: card.text,
    link: card.link,
    data: {
      dteId,
      __customText: card.text,
      __customBlocks: card.blocks,
    },
  });
}

async function updateSourceCard(params: {
  tenantId: string;
  dteId: string;
  token: string;
  channelId?: string;
  messageTs?: string;
}): Promise<void> {
  if (!params.channelId || !params.messageTs) return;
  const card = await buildReceivedDteSlackCard(params.tenantId, params.dteId);
  if (!card) return;
  await slackUpdateMessage(params.token, {
    channel: params.channelId,
    ts: params.messageTs,
    text: card.text,
    blocks: card.blocks,
  });
}

type DteBlockPayload = {
  team?: { id?: string };
  user?: { id?: string };
  response_url?: string;
  actions?: Array<{ action_id?: string; value?: string }>;
  container?: { channel_id?: string; message_ts?: string };
};

export async function handleDteAcuseAction(payload: DteBlockPayload): Promise<void> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const actionId = payload.actions?.[0]?.action_id ?? "";
  const dteId = payload.actions?.[0]?.value;
  const action = ACTION_BY_ID[actionId];
  if (!teamId || !slackUserId || !dteId || !action) return;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return;
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return;
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) {
    const prompt = buildLinkPrompt(workspace, slackUserId);
    if (payload.response_url) {
      await slackRespondUrl(payload.response_url, { response_type: "ephemeral", text: prompt.text, blocks: prompt.blocks });
    }
    return;
  }
  if (!hasFacturacionCapability(linked.perms, "facturacion_create_draft")) {
    if (payload.response_url) {
      await slackRespondUrl(payload.response_url, { response_type: "ephemeral", text: "No tienes permiso para acusar DTEs recibidos en el SII." });
    }
    return;
  }

  const result = await applyAcuse(workspace.tenantId, linked.adminId, {
    dteId,
    action,
    notifySii: true,
    reason: `Acción ejecutada desde Slack por ${slackUserId}`,
  });

  if (result.success) {
    await updateSourceCard({
      tenantId: workspace.tenantId,
      dteId,
      token: workspace.botToken,
      channelId: payload.container?.channel_id,
      messageTs: payload.container?.message_ts,
    }).catch((err) => console.error("[slack/dte] no se pudo refrescar la tarjeta:", err));
  }
  if (payload.response_url) {
    await slackRespondUrl(payload.response_url, {
      response_type: "ephemeral",
      text: result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
    });
  }
}

async function assignReceivedDteCostCenter(params: {
  tenantId: string;
  dteId: string;
  crmAccountId: string;
  installationId: string | null;
  adminId: string;
}): Promise<void> {
  const [dte, account, installation] = await Promise.all([
    prisma.financeDte.findFirst({
      where: { id: params.dteId, tenantId: params.tenantId, direction: "RECEIVED" },
      select: { id: true },
    }),
    prisma.crmAccount.findFirst({
      where: { id: params.crmAccountId, tenantId: params.tenantId },
      select: { id: true },
    }),
    params.installationId
      ? prisma.crmInstallation.findFirst({
          where: {
            id: params.installationId,
            tenantId: params.tenantId,
            accountId: params.crmAccountId,
          },
          select: { id: true },
        })
      : null,
  ]);
  if (!dte) throw new Error("DTE recibido no encontrado");
  if (!account) throw new Error("Cliente no encontrado");
  if (params.installationId && !installation) {
    throw new Error("La instalación no pertenece al cliente seleccionado");
  }

  await prisma.financeDte.update({
    where: { id: params.dteId },
    data: { crmAccountId: params.crmAccountId, installationId: params.installationId },
  });
  await logAudit({
    action: "UPDATE",
    entity: "FinanceDte",
    entityId: params.dteId,
    tenantId: params.tenantId,
    userId: params.adminId,
    details: {
      source: "slack",
      crmAccountId: params.crmAccountId,
      installationId: params.installationId,
    },
  });
}

function selectedCostCenter(state: ViewState): string | undefined {
  return state.cost_center?.selection?.selected_option?.value;
}

export const dteCostCenterModal: ModalDef = {
  callbackId: CALLBACK_ID,
  title: "Centro de costo DTE",
  requires: (perms) => hasFacturacionCapability(perms, "facturacion_create_draft"),
  requiresMessage: "No tienes permiso para editar DTEs recibidos.",
  build: async (ctx) => {
    const dteId = ctx.arg ?? "";
    const loaded = await loadCardData(ctx.tenantId, dteId);
    if (!loaded) throw new Error("DTE recibido no encontrado");
    const currentLabel = loaded.accountName
      ? `${loaded.accountName}${loaded.installationName ? ` · ${loaded.installationName}` : ""}`
      : null;
    const currentValue = loaded.dte.crmAccountId
      ? `${loaded.dte.crmAccountId}:${loaded.dte.installationId ?? "-"}`
      : null;

    return {
      type: "modal",
      callback_id: CALLBACK_ID,
      private_metadata: packMetadata({
        kind: CALLBACK_ID,
        entityId: dteId,
        channelId: ctx.channelId,
        messageTs: ctx.messageTs,
      }),
      title: { type: "plain_text", text: "Centro de costo DTE" },
      submit: { type: "plain_text", text: "Vincular" },
      close: { type: "plain_text", text: "Cancelar" },
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${getDteTypeName(loaded.dte.dteType)} N° ${loaded.dte.folio}*\n${loaded.dte.issuerName} · ${formatCLP(loaded.dte.totalAmount.toNumber())}`,
          },
        },
        {
          type: "input",
          block_id: "cost_center",
          label: { type: "plain_text", text: "Cliente o instalación" },
          element: {
            type: "external_select",
            action_id: "selection",
            min_query_length: 1,
            placeholder: { type: "plain_text", text: "Buscar cliente o instalación" },
            ...(currentLabel && currentValue
              ? {
                  initial_option: {
                    text: { type: "plain_text", text: clip(currentLabel) },
                    value: currentValue,
                  },
                }
              : {}),
          },
        },
      ],
    };
  },
  submit: async (ctx) => {
    const value = selectedCostCenter(ctx.state);
    if (!value) {
      return { ack: { response_action: "errors", errors: { cost_center: "Selecciona un centro de costo." } } };
    }
    const [crmAccountId, rawInstallationId] = value.split(":");
    const installationId = rawInstallationId && rawInstallationId !== "-" ? rawInstallationId : null;
    const dteId = ctx.metadata.entityId ?? "";
    return {
      ack: {},
      work: async () => {
        await assignReceivedDteCostCenter({
          tenantId: ctx.tenantId,
          dteId,
          crmAccountId,
          installationId,
          adminId: ctx.linked.adminId,
        });
        await updateSourceCard({
          tenantId: ctx.tenantId,
          dteId,
          token: ctx.workspace.botToken,
          channelId: ctx.metadata.channelId,
          messageTs: ctx.metadata.messageTs,
        }).catch((err) => console.error("[slack/dte] no se pudo refrescar centro de costo:", err));
      },
    };
  },
};

type SuggestionPayload = {
  team?: { id?: string };
  user?: { id?: string };
  value?: string;
};

export async function handleDteCostCenterSuggestion(
  payload: SuggestionPayload,
): Promise<{ options: unknown[] }> {
  const teamId = payload.team?.id;
  const slackUserId = payload.user?.id;
  const q = payload.value?.trim() ?? "";
  if (!teamId || !slackUserId || !q) return { options: [] };
  const resolved = await getTenantForTeam(teamId);
  if (!resolved) return { options: [] };
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) return { options: [] };
  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked || !hasFacturacionCapability(linked.perms, "facturacion_create_draft")) {
    return { options: [] };
  }

  const [installations, accounts] = await Promise.all([
    prisma.crmInstallation.findMany({
      where: {
        tenantId: workspace.tenantId,
        accountId: { not: null },
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { account: { name: { contains: q, mode: "insensitive" } } },
          { account: { legalName: { contains: q, mode: "insensitive" } } },
        ],
      },
      select: { id: true, name: true, accountId: true, account: { select: { name: true, legalName: true } } },
      take: 60,
      orderBy: { name: "asc" },
    }),
    prisma.crmAccount.findMany({
      where: {
        tenantId: workspace.tenantId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { legalName: { contains: q, mode: "insensitive" } },
          { rut: { contains: q, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, legalName: true },
      take: 30,
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    options: [
      ...installations.map((installation) => ({
        text: {
          type: "plain_text",
          text: clip(`${installation.account?.legalName ?? installation.account?.name ?? "Cliente"} · ${installation.name}`),
        },
        value: `${installation.accountId}:${installation.id}`,
      })),
      ...accounts.map((account) => ({
        text: { type: "plain_text", text: clip(`${account.legalName ?? account.name} · Sin instalación`) },
        value: `${account.id}:-`,
      })),
    ].slice(0, 100),
  };
}
