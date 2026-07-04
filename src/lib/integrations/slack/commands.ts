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
  let subName = first.toLowerCase();
  let rawRest = restArr.join(" ").trim();
  // Alias (F21): `/opai buscar negocio <texto>` = `/opai negocio <texto>` (el
  // buscador universal de negocios, no la búsqueda global del asistente).
  if (subName === "buscar" && /^negocio(s)?\b/i.test(rawRest)) {
    subName = "negocio";
    rawRest = rawRest.replace(/^negocio(s)?\s*/i, "").trim();
  }
  const sub = SUBCOMMANDS.find((c) => c.name === subName);

  // Subcomandos que abren un modal nativo (ticket, rendición, bandeja).
  if (sub?.kind === "modal") {
    if (!input.triggerId) {
      await ephemeral("No pude abrir el formulario. Intenta de nuevo.");
      return;
    }
    // Variantes pre-filtradas: `/opai tickets vencidos`, `/opai leads nuevos`,
    // `/opai cotizaciones enviadas|borrador|aceptadas|rechazadas`.
    const rest = rawRest.toLowerCase();
    let callbackId = sub.callbackId;
    if (sub.name === "tickets" && rest === "vencidos") callbackId = "opai_tickets_vencidos";
    else if (sub.name === "leads" && rest === "nuevos") callbackId = "opai_leads_nuevos";
    else if (sub.name === "cotizaciones" && rest) {
      const { quotesStatusFromArg } = await import("./comercial/quotes-tray");
      const st = quotesStatusFromArg(rest);
      if (st) callbackId = `opai_cotizaciones_${st}`;
    }
    // El modal ES el feedback (F17): abrimos y ELIMINAMOS el "⏳ Procesando…"
    // que emitió el route vía `delete_original` — cero efímeros huérfanos. Si el
    // modal no abrió (trigger vencido), mutamos el efímero a un aviso claro.
    const opened = await openModalByCallback({ teamId, triggerId: input.triggerId, callbackId, slackUserId, channelId, arg: rawRest });
    if (opened) await slackRespondUrl(responseUrl, { delete_original: true });
    else await ephemeral("No pude abrir el formulario. Intenta de nuevo.");
    return;
  }

  // Resto: consulta al asistente (subcomando prompt o pregunta libre).
  const prompt = sub?.kind === "prompt" ? sub.toPrompt(rawRest) : trimmed;

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
