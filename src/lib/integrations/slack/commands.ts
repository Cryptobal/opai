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

export interface SlashCommandInput {
  teamId: string;
  slackUserId: string;
  channelId: string;
  text: string;
  responseUrl: string;
}

const PENDING_TTL_MS = 15 * 60 * 1000;

const HELP_TEXT = [
  "*OPAI Intelligence en Slack*",
  "• `/opai <pregunta>` — pregunta libre al asistente",
  "• `/opai caja` — resumen ejecutivo de caja y proyección del mes",
  "• `/opai asistencia` — resumen de asistencia de hoy",
  "• `/opai buscar <texto>` — busca en todo el sistema",
  "• `/opai ayuda` — esta ayuda",
  "",
  "También puedes mencionarme (`@OPAI`) en un canal o escribirme por DM.",
].join("\n");

/** Traduce el subcomando a un mensaje de usuario para el runner. */
function resolvePrompt(text: string): string | null {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "ayuda" || lower === "help") return null; // → ayuda
  if (lower === "caja") return "Resumen ejecutivo de la caja actual y proyección del mes";
  if (lower === "asistencia") return "Resumen de asistencia de hoy";
  if (lower.startsWith("buscar ")) {
    return `Busca en todo el sistema (usa la herramienta search_all) y resume: ${trimmed.slice(7).trim()}`;
  }
  return trimmed;
}

export async function handleSlashCommand(input: SlashCommandInput): Promise<void> {
  const { teamId, slackUserId, channelId, responseUrl } = input;

  const resolved = await getTenantForTeam(teamId);
  if (!resolved) {
    await slackRespondUrl(responseUrl, { response_type: "ephemeral", replace_original: true, text: "Workspace no reconocido." });
    return;
  }
  const workspace = await getWorkspaceForTenant(resolved.tenantId);
  if (!workspace) {
    await slackRespondUrl(responseUrl, { response_type: "ephemeral", replace_original: true, text: "Slack no está activo para tu organización." });
    return;
  }

  const prompt = resolvePrompt(input.text);
  if (prompt === null) {
    await slackRespondUrl(responseUrl, { response_type: "ephemeral", replace_original: true, text: HELP_TEXT, blocks: [assistantSection(HELP_TEXT)] });
    return;
  }

  const linked = await resolveLinkedAdmin(workspace, slackUserId);
  if (!linked) {
    const linkPrompt = buildLinkPrompt(workspace, slackUserId);
    await slackRespondUrl(responseUrl, { response_type: "ephemeral", replace_original: true, text: linkPrompt.text, blocks: linkPrompt.blocks });
    return;
  }

  try {
    const cfg = await getAiHelpChatConfig(workspace.tenantId);
    const result = await runHelpChatTurn({
      tenantId: workspace.tenantId,
      userId: linked.adminId,
      perms: linked.perms,
      canViewAllRendiciones: hasCapability(linked.perms, "rendicion_view_all"),
      history: [],
      userMessage: prompt,
      allowWrites: cfg.allowWrites,
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
