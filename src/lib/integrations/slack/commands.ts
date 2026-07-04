/**
 * Slash command `/opai` — consulta al asistente OPAI Intelligence desde Slack.
 *
 * El ACK inmediato (ephemeral "⏳ Procesando…") lo envía el route; el trabajo
 * corre en after() y la respuesta final llega por `response_url`. Turno SIN
 * memoria de thread (cada comando es independiente). Mismo gate de vínculo que
 * el bot: usuario no vinculado = cero datos.
 */

import { hasCapability } from "@/lib/permissions";
import { getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import { runHelpChatTurn } from "@/lib/ai/help-chat-runner";
import { prisma } from "@/lib/prisma";
import { getTenantForTeam, getWorkspaceForTenant } from "./workspace";
import { resolveLinkedAdmin, buildLinkPrompt } from "./user-link";
import { slackRespondUrl } from "./api";
import { toSlackMarkdown } from "./markdown";
import { assistantSection, contextLine, confirmActionsBlock } from "./blocks";
import { openModalByCallback } from "./modals/dispatch";
import { SUBCOMMANDS, buildHelpText } from "./subcommands";

export interface SlashCommandInput {
  teamId: string;
  slackUserId: string;
  channelId: string;
  text: string;
  responseUrl: string;
  triggerId?: string;
}

const PENDING_TTL_MS = 15 * 60 * 1000;

export async function handleSlashCommand(input: SlashCommandInput): Promise<void> {
  const { teamId, slackUserId, channelId, responseUrl } = input;
  const ephemeral = (text: string, blocks?: unknown[]) =>
    slackRespondUrl(responseUrl, { response_type: "ephemeral", replace_original: true, text, blocks });

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) {
    await ephemeral("Workspace no reconocido.");
    return;
  }
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) {
    await ephemeral("Slack no está activo para tu organización.");
    return;
  }

  const trimmed = input.text.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "ayuda" || lower === "help") {
    const help = buildHelpText();
    await ephemeral(help, [assistantSection(help)]);
    return;
  }

  const [first, ...restArr] = trimmed.split(/\s+/);
  const sub = SUBCOMMANDS.find((c) => c.name === first.toLowerCase());

  // Subcomandos que abren un modal nativo (ticket, rendición, bandeja).
  if (sub?.kind === "modal") {
    if (!input.triggerId) {
      await ephemeral("No pude abrir el formulario. Intenta de nuevo.");
      return;
    }
    // Variantes pre-filtradas: `/opai tickets vencidos`, `/opai leads nuevos`,
    // `/opai cotizaciones enviadas|borrador|aceptadas|rechazadas`.
    const rest = restArr.join(" ").trim().toLowerCase();
    let callbackId = sub.callbackId;
    if (sub.name === "tickets" && rest === "vencidos") callbackId = "opai_tickets_vencidos";
    else if (sub.name === "leads" && rest === "nuevos") callbackId = "opai_leads_nuevos";
    else if (sub.name === "cotizaciones" && rest) {
      const { quotesStatusFromArg } = await import("./comercial/quotes-tray");
      const st = quotesStatusFromArg(rest);
      if (st) callbackId = `opai_cotizaciones_${st}`;
    }
    await openModalByCallback({ teamId, triggerId: input.triggerId, callbackId, slackUserId, channelId });
    await ephemeral("📂 Abriendo…");
    return;
  }

  // Resto: consulta al asistente (subcomando prompt o pregunta libre).
  const prompt = sub?.kind === "prompt" ? sub.toPrompt(restArr.join(" ")) : trimmed;

  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) {
    const linkPrompt = buildLinkPrompt(workspace, slackUserId);
    await slackRespondUrl(responseUrl, { response_type: "ephemeral", replace_original: true, text: linkPrompt.text, blocks: linkPrompt.blocks });
    return;
  }

  try {
    const cfg = await getAiHelpChatConfig(workspace.tenantId);
    // Channel Expert (Fase 16): un `/opai` disparado dentro de una sala de
    // negocio también recibe el doble contexto (conversación + ficha del deal).
    const { buildDealRoomContextHint } = await import("./deal-rooms/channel-expert");
    const contextHint = await buildDealRoomContextHint(workspace.tenantId, channelId).catch(() => null);
    const result = await runHelpChatTurn({
      tenantId: workspace.tenantId,
      userId: linked.adminId,
      perms: linked.perms,
      canViewAllRendiciones: hasCapability(linked.perms, "rendicion_view_all"),
      history: [],
      userMessage: prompt,
      allowWrites: cfg.allowWrites,
      contextHint: contextHint ?? undefined,
    });

    const blocks: unknown[] = [assistantSection(toSlackMarkdown(result.text))];
    if (result.pendingConfirmation) {
      const pa = await prisma.slackPendingAction.create({
        data: {
          tenantId: workspace.tenantId,
          workspaceId: workspace.id,
          kind: "TOOL_CONFIRM",
          toolName: result.pendingConfirmation.confirmToolName,
          toolArgs: result.pendingConfirmation.args as object,
          requestedBySlackUserId: slackUserId,
          channelId,
          status: "PENDING",
          expiresAt: new Date(Date.now() + PENDING_TTL_MS),
        },
        select: { id: true },
      });
      blocks.push(contextLine(`⚠️ Acción: *${result.pendingConfirmation.summary}* · confirma o cancela (vence en 15 min)`));
      blocks.push(confirmActionsBlock(pa.id));
    }

    await slackRespondUrl(responseUrl, {
      response_type: "ephemeral",
      replace_original: true,
      text: result.text.slice(0, 2900),
      blocks,
    });
  } catch (err) {
    console.error("[slack] error en slash command /opai:", err);
    await slackRespondUrl(responseUrl, { response_type: "ephemeral", replace_original: true, text: "⚠️ No pude completar la consulta. Intenta de nuevo." });
  }
}
