/**
 * Runner NO-streaming del asistente OPAI Intelligence (help-chat v2).
 *
 * Replica el loop de tool-calling del stream route (chat web) pero acumulando
 * el texto en vez de emitir SSE, para transportes externos (Slack). Mismo
 * system prompt v2, mismas tool definitions, mismo tope de 12 pasos, mismos
 * permisos e identidad del usuario (Admin vinculado).
 *
 * Diferencia clave para transportes externos: las escrituras se DIFIEREN. Las
 * tools de escritura (directas o `preview_*`) nunca persisten aquí; se exponen
 * como `pendingConfirmations` (hasta 5 por turno) para que tarjetas
 * interactivas independientes las ejecuten al confirmar. Las `preview_*`
 * (solo cálculo, no persisten) sí se ejecutan para mostrar montos reales.
 */

import { prisma } from "@/lib/prisma";
import type { RolePermissions } from "@/lib/permissions";
import { getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import { retrieveDocsContext, retrieveTemplatesContext } from "@/lib/ai/help-chat-retrieval";
import {
  getToolDefinitionsV2,
  executeToolCallV2,
  PREVIEW_TO_CONFIRM,
  WRITE_TOOL_NAMES,
  WRITE_TOOL_LABELS,
} from "@/lib/ai/help-chat-tools-v2";
import { buildHelpChatSystemPromptV2 } from "@/lib/ai/help-chat-system-prompt-v2";
import { parseVisualBlocks } from "@/lib/ai/help-chat-visual-types";
import { detectFrustration } from "@/lib/ai/help-chat-model-router";
import { searchKnowledge } from "@/lib/knowledge/search";
import {
  getHelpChatAIConfig as getProviderConfig,
  createStreamingCompletion,
  type ToolCallInfo,
} from "@/lib/ai/help-chat-provider";
import { logAiUsage } from "@/lib/platform-ai-service";
import { getCanonicalSiteUrl } from "@/lib/emails/site-url";
import {
  fallbackMessage,
  normalizeAssistantLinks,
  resolveEffectiveModel,
  trimHistory,
} from "@/lib/ai/help-chat-shared";

const MAX_TOOL_STEPS = 12;
// Tope de escrituras diferidas por turno: cada una genera su propia tarjeta
// de confirmación en Slack; más de 5 satura el mensaje y el TTL de 15 min.
const MAX_PENDING_WRITES = 5;

export interface PendingConfirmation {
  previewToolName?: string;
  confirmToolName: string;
  args: Record<string, unknown>;
  summary: string;
}

export interface HelpChatTurnResult {
  text: string;
  toolCallsUsed: number;
  model: string;
  pendingConfirmations?: PendingConfirmation[];
  /** Entidades con URL profunda tocadas por las tools (≤3), para tarjetas en Slack. */
  entities?: Array<{ title: string; subtitle?: string; url: string }>;
}

/** Recolecta entidades con `url` de un resultado de tool (para tarjetas de Slack). */
function collectEntities(
  acc: Array<{ title: string; subtitle?: string; url: string }>,
  result: unknown,
  base: string,
): void {
  if (acc.length >= 3) return;
  const r = result as { data?: unknown } | null;
  const data = r && typeof r === "object" && "data" in r ? r.data : result;
  const candidates: unknown[] = [];
  if (Array.isArray(data)) candidates.push(...data);
  else if (data && typeof data === "object") {
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v)) candidates.push(...v);
      else if (v && typeof v === "object") candidates.push(v);
    }
  }
  for (const it of candidates) {
    if (acc.length >= 3) break;
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (typeof o.url !== "string" || !o.url) continue;
    const url = o.url.startsWith("http") ? o.url : `${base}${o.url}`;
    if (acc.some((e) => e.url === url)) continue;
    const title = String(o.nombre ?? o.title ?? o.titulo ?? o.name ?? o.code ?? "Ver detalle").slice(0, 80);
    const subtitle =
      [o.code, o.cliente, o.estado, o.status, o.priority]
        .filter((x) => typeof x === "string" && x)
        .slice(0, 3)
        .join(" · ") || undefined;
    acc.push({ title, subtitle, url });
  }
}

export interface RunHelpChatTurnInput {
  tenantId: string;
  userId: string;
  perms: RolePermissions;
  canViewAllRendiciones: boolean;
  /** Historial previo (turnos user/assistant), sin el mensaje actual. */
  history: Array<{ role: string; content: string }>;
  userMessage: string;
  /** Si el tenant permite escrituras. Cuando true, se DIFIEREN a confirmación. */
  allowWrites: boolean;
  /** Contexto situado opcional (p. ej. canal que el usuario mira en el panel de IA de Slack). */
  contextHint?: string;
}

/**
 * Ejecuta un turno completo del asistente y devuelve el texto final ya
 * normalizado (links absolutos, sin bloques `:::visual/:::suggestions`),
 * el número de tools usadas y — si aplica — las escrituras pendientes de
 * confirmación (máx. 5 por turno).
 */
export async function runHelpChatTurn(input: RunHelpChatTurnInput): Promise<HelpChatTurnResult> {
  const t0 = Date.now();
  const { tenantId, userId, perms, canViewAllRendiciones, allowWrites } = input;
  const userMessage = input.userMessage.trim();
  const appBaseUrl = getCanonicalSiteUrl();
  // En transportes externos, escribir siempre pasa por confirmación.
  const deferWrites = allowWrites;

  const cfg = await getAiHelpChatConfig(tenantId);

  const adminRow = await prisma.admin.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true },
  });
  const userDisplayName = adminRow?.name?.trim() || adminRow?.email || "Usuario";
  const userRole = adminRow?.role ?? "";

  /* retrieval (docs + templates + base de conocimiento) */
  const [docsChunks, templatesChunks] = await Promise.all([
    retrieveDocsContext(userMessage, 6),
    retrieveTemplatesContext(tenantId, userMessage, 4),
  ]);
  let knowledgeChunks: Array<{ content: string; score: number; knowledgeBaseTitle: string }> = [];
  try {
    knowledgeChunks = await searchKnowledge(userMessage, tenantId, 5);
  } catch (e) {
    console.warn("[help-chat-runner] KB search error:", e);
  }

  const allChunks = [...docsChunks, ...templatesChunks];
  let docsContext = allChunks
    .map((item, index) => `Bloque ${index + 1} (${item.title}):\n${item.body}`)
    .join("\n\n");
  if (knowledgeChunks.length > 0) {
    const kbContext = knowledgeChunks
      .map((k, i) => `KB ${i + 1} [${k.knowledgeBaseTitle}]:\n${k.content}`)
      .join("\n\n");
    docsContext = docsContext
      ? `${docsContext}\n\nBase de conocimiento de la empresa:\n${kbContext}`
      : `Base de conocimiento de la empresa:\n${kbContext}`;
  }
  const retrievalHasEvidence = allChunks.length > 0 || knowledgeChunks.length > 0;
  const kbMaxScore = knowledgeChunks.length > 0 ? Math.max(...knowledgeChunks.map((k) => k.score)) : 0;
  const retrievalMaxScore = Math.max(
    allChunks.length > 0 ? Math.max(...allChunks.map((c) => c.score)) : 0,
    kbMaxScore,
  );

  /* proveedor de IA (DB del tenant → fallback env) */
  const aiConfig = await getProviderConfig(tenantId);
  if (!aiConfig) {
    return {
      text: "No hay un proveedor de IA configurado. Contacta al administrador de la plataforma.",
      toolCallsUsed: 0,
      model: "",
    };
  }

  const recentFallbackCount = input.history
    .slice(-6)
    .filter((m) => m.role === "assistant" && m.content.includes("No tengo suficiente información")).length;
  const frustrated = detectFrustration(userMessage);
  const effectiveModel = resolveEffectiveModel(aiConfig, {
    retrievalMaxScore,
    recentFallbackCount,
    frustrated,
  });
  const configWithModel = { ...aiConfig, model: effectiveModel };

  const todayLabel = new Date().toLocaleString("es-CL", { dateStyle: "full", timeStyle: "short" });
  const systemPrompt = buildHelpChatSystemPromptV2({
    fallbackText: fallbackMessage(),
    allowDataQuestions: cfg.allowDataQuestions,
    todayLabel,
    appBaseUrl,
    retrievalHasEvidence,
    userName: userDisplayName,
    userRole,
  });

  const trimmedHistory = trimHistory(input.history);
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    {
      role: "system",
      content: `Contexto documental y base de conocimiento relevante:\n${docsContext || "(sin bloques relevantes encontrados)"}`,
    },
    ...trimmedHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  if (input.contextHint) {
    messages.splice(2, 0, { role: "system", content: input.contextHint });
  }

  const tools = getToolDefinitionsV2(cfg.allowDataQuestions, allowWrites);
  const completionParams = { messages, tools, temperature: 0.2, maxTokens: 2800 };

  let fullText = "";
  let toolCallsUsed = 0;
  const pendings: PendingConfirmation[] = [];
  const entities: Array<{ title: string; subtitle?: string; url: string }> = [];

  for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
    let pendingToolCalls: ToolCallInfo[] = [];
    let hasToolCalls = false;

    for await (const event of createStreamingCompletion(configWithModel, completionParams)) {
      if (event.type === "token") fullText += event.text;
      if (event.type === "tool_calls") {
        hasToolCalls = true;
        pendingToolCalls = event.calls;
      }
    }

    if (!hasToolCalls || pendingToolCalls.length === 0) break;

    toolCallsUsed += pendingToolCalls.length;
    messages.push({
      role: "assistant",
      content: fullText || null,
      tool_calls: pendingToolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });
    // Cada iteración con tool_calls solo trae razonamiento previo; el texto
    // final llega cuando el modelo deja de llamar tools. Reseteamos para no
    // acumular borradores intermedios.
    fullText = "";

    for (const call of pendingToolCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        args = {};
      }

      const previewMap = PREVIEW_TO_CONFIRM[call.name];
      const isDeferredWrite = deferWrites && WRITE_TOOL_NAMES.has(call.name);

      let result: unknown;
      if (isDeferredWrite) {
        // Escritura directa (o el `create_*` de un flujo preview): NO se ejecuta.
        // Se difiere a SU PROPIA tarjeta de confirmación con estos args exactos.
        if (pendings.length >= MAX_PENDING_WRITES) {
          result = {
            ok: false,
            executed: false,
            status: "limit_reached",
            message:
              "Máximo 5 acciones por turno. Pide al usuario confirmar estas y luego continuar con el resto.",
          };
        } else {
          pendings.push({
            confirmToolName: call.name,
            args,
            summary: WRITE_TOOL_LABELS[call.name] ?? call.name,
          });
          // executed:false es deliberado: el modelo NO debe afirmar que la acción
          // ya ocurrió. Solo se ejecutará cuando el usuario presione Confirmar.
          result = {
            ok: true,
            executed: false,
            status: "pending_confirmation",
            message:
              "Acción PREPARADA pero NO ejecutada; se ejecutará solo cuando el usuario presione Confirmar en Slack. Si el usuario pidió VARIAS acciones, puedes preparar las siguientes (máx. 5 por turno). Al final resume en 1-2 frases QUÉ quedará pendiente de confirmar. NO afirmes que algo ya está hecho.",
          };
        }
      } else {
        try {
          result = await executeToolCallV2(
            call.name, args, tenantId, userId, perms, canViewAllRendiciones, null,
          );
        } catch (err) {
          // Aísla el fallo de UNA tool: el modelo puede recuperarse en vez de
          // abortar todo el turno. Error ruidoso en logs.
          console.error(`[help-chat-runner] tool ${call.name} lanzó excepción:`, err);
          result = { ok: false, error: "La herramienta falló temporalmente. Intenta reformular o vuelve a intentar." };
        }
        // `preview_*` es solo cálculo (no persiste): sí se ejecuta y, si sale
        // ok, deja pendiente la escritura mapeada con SUS mismos args.
        if (previewMap && (result as { ok?: boolean })?.ok) {
          if (pendings.length >= MAX_PENDING_WRITES) {
            result = {
              ok: false,
              executed: false,
              status: "limit_reached",
              message:
                "Máximo 5 acciones por turno. Pide al usuario confirmar estas y luego continuar con el resto.",
            };
          } else {
            pendings.push({
              previewToolName: call.name,
              confirmToolName: previewMap.confirmToolName,
              args,
              summary: previewMap.label,
            });
          }
        }
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      if (!isDeferredWrite) collectEntities(entities, result, appBaseUrl);
    }
  }

  // Cierre sin tools si el modelo agotó pasos sin redactar respuesta final.
  if (!fullText.trim()) {
    for await (const event of createStreamingCompletion(configWithModel, {
      ...completionParams,
      tools: [],
    })) {
      if (event.type === "token") fullText += event.text;
    }
  }

  const normalized = normalizeAssistantLinks(fullText || fallbackMessage(), appBaseUrl);
  const { cleanText } = parseVisualBlocks(normalized);

  logAiUsage({
    tenantId,
    userId,
    providerType: aiConfig.providerType,
    model: effectiveModel,
    feature: "help_chat_slack",
    durationMs: Date.now() - t0,
  });

  return {
    text: cleanText.trim() || fallbackMessage(),
    toolCallsUsed,
    model: effectiveModel,
    pendingConfirmations: pendings.length ? pendings : undefined,
    entities: entities.length ? entities.slice(0, 3) : undefined,
  };
}
