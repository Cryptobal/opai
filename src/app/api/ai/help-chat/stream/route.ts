import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { canUseAiHelpChat, getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import { retrieveDocsContext, retrieveTemplatesContext } from "@/lib/ai/help-chat-retrieval";
import { getToolDefinitionsV2, executeToolCallV2 } from "@/lib/ai/help-chat-tools-v2";
import { buildHelpChatSystemPromptV2 } from "@/lib/ai/help-chat-system-prompt-v2";
import { parseVisualBlocks } from "@/lib/ai/help-chat-visual-types";
import {
  resolveFunctionalIntent,
  shouldPreferFunctionalInference,
} from "@/lib/ai/help-chat-intents";
import { chooseModel, detectFrustration } from "@/lib/ai/help-chat-model-router";
import { searchKnowledge } from "@/lib/knowledge/search";
import {
  getHelpChatAIConfig as getProviderConfig,
  createStreamingCompletion,
  type HelpChatAIConfig,
  type ToolCallInfo,
} from "@/lib/ai/help-chat-provider";
import { logAiUsage } from "@/lib/platform-ai-service";

/* ── helpers ── */

function hasChatPersistence(): boolean {
  const db = prisma as unknown as Record<string, unknown>;
  return Boolean(db.aiChatConversation && db.aiChatMessage);
}

function fallbackMessage(_question: string): string {
  return `No tengo datos específicos para responder eso con certeza. ¿Puedes darme más contexto o reformular tu pregunta?`;
}

function toAbsoluteUrl(pathname: string, appBaseUrl: string): string {
  if (!pathname.startsWith("/")) return pathname;
  const base = appBaseUrl.endsWith("/") ? appBaseUrl.slice(0, -1) : appBaseUrl;
  return `${base}${pathname}`;
}

function normalizeAssistantLinks(text: string, appBaseUrl: string): string {
  let output = text;
  output = output.replace(
    /-\s*URL:\s*`(\/[^`]+)`/gi,
    (_, path: string) => `- Ingresa acá: [Abrir enlace](${toAbsoluteUrl(path, appBaseUrl)})`,
  );
  output = output.replace(
    /\[([^\]]+)\]\((\/[^)\s]+)\)/g,
    (_, label: string, path: string) => `[${label}](${toAbsoluteUrl(path, appBaseUrl)})`,
  );
  output = output.replace(
    /`(\/[a-z0-9\-/_[\]]+)`/gi,
    (_, path: string) => `[Ingresa acá](${toAbsoluteUrl(path, appBaseUrl)})`,
  );
  output = output.replace(
    /\((\/[a-z0-9\-/_[\]]+)\)/gi,
    (_, path: string) => `(Ingresa acá: [Abrir enlace](${toAbsoluteUrl(path, appBaseUrl)}))`,
  );
  return output;
}

function clipTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Nueva conversación";
  return clean.length > 90 ? `${clean.slice(0, 87)}...` : clean;
}

/**
 * Resolves the effective model to use.
 * For platform-configured providers we honour the chosen model.
 * For the env-var fallback (OpenAI) we apply the dynamic model router.
 */
function resolveModel(
  aiConfig: HelpChatAIConfig,
  ctx: { retrievalMaxScore: number; recentFallbackCount: number; frustrated: boolean },
): string {
  if (aiConfig.source === "platform") return aiConfig.model;
  return chooseModel(ctx);
}

/* ── SSE POST handler ── */

export async function POST(request: NextRequest) {
  const t0 = Date.now();

  /* auth + RBAC */
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);

  const cfg = await getAiHelpChatConfig(ctx.tenantId);
  if (!canUseAiHelpChat(ctx.userRole, cfg)) {
    return new Response(JSON.stringify({ success: false, error: "No tienes acceso al asistente" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const adminRow = await prisma.admin.findUnique({
    where: { id: ctx.userId },
    select: { name: true },
  });
  const userDisplayName = adminRow?.name?.trim() || ctx.userEmail || "Usuario";

  /* parse body */
  const body = (await request.json().catch(() => ({}))) as {
    message?: unknown;
    conversationId?: unknown;
  };
  const appBaseUrl = request.nextUrl.origin;
  const userMessage = typeof body.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return new Response(JSON.stringify({ success: false, error: "El mensaje es obligatorio" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  /* conversation management */
  const persistenceEnabled = hasChatPersistence();
  const existingConversationId =
    persistenceEnabled && typeof body.conversationId === "string" ? body.conversationId : undefined;

  let conversation: { id: string } | null = null;
  if (persistenceEnabled) {
    conversation = existingConversationId
      ? await prisma.aiChatConversation.findFirst({
          where: { id: existingConversationId, tenantId: ctx.tenantId, userId: ctx.userId },
        })
      : await prisma.aiChatConversation.create({
          data: { tenantId: ctx.tenantId, userId: ctx.userId, title: clipTitle(userMessage) },
        });
  }

  if (persistenceEnabled && !conversation) {
    return new Response(JSON.stringify({ success: false, error: "No se encontró la conversación" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  /* save user message */
  if (persistenceEnabled && conversation) {
    await prisma.aiChatMessage.create({
      data: { conversationId: conversation.id, tenantId: ctx.tenantId, role: "user", content: userMessage },
    });
  }

  /* load conversation history */
  let conversationHistory: Array<{ role: string; content: string }> = [];
  if (persistenceEnabled && conversation) {
    const historyMessages = await prisma.aiChatMessage.findMany({
      where: { conversationId: conversation.id },
      select: { role: true, content: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }],
      take: 24,
    });
    conversationHistory = historyMessages.slice(0, -1).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));
  }

  /* retrieval (docs + templates + knowledge bases) */
  let knowledgeChunks: Array<{ content: string; score: number; knowledgeBaseTitle: string; chunkIndex: number }> = [];
  const [docsChunks, templatesChunks] = await Promise.all([
    retrieveDocsContext(userMessage, 6),
    retrieveTemplatesContext(ctx.tenantId, userMessage, 4),
  ]);
  try {
    knowledgeChunks = await searchKnowledge(userMessage, ctx.tenantId, 5);
  } catch (e) {
    console.warn("[KB Search] Error:", e);
  }

  const allChunks = [...docsChunks, ...templatesChunks];
  let docsContext = allChunks
    .map((item, index) => `Bloque ${index + 1} (${item.title}):\n${item.body}`)
    .join("\n\n");

  // Append knowledge base RAG context
  if (knowledgeChunks.length > 0) {
    const kbContext = knowledgeChunks
      .map((k, i) => `KB ${i + 1} [${k.knowledgeBaseTitle}]:\n${k.content}`)
      .join("\n\n");
    docsContext = docsContext
      ? `${docsContext}\n\nBase de conocimiento de la empresa:\n${kbContext}`
      : `Base de conocimiento de la empresa:\n${kbContext}`;
  }

  const retrievalHasEvidence = allChunks.length > 0 || knowledgeChunks.length > 0;
  const kbMaxScore = knowledgeChunks.length > 0 ? Math.max(...knowledgeChunks.map(k => k.score)) : 0;
  const retrievalMaxScore = Math.max(
    allChunks.length > 0 ? Math.max(...allChunks.map(c => c.score)) : 0,
    kbMaxScore,
  );

  /* resolve AI provider (tenant DB → env fallback) */
  const aiConfig = await getProviderConfig(ctx.tenantId);
  if (!aiConfig) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "No hay un proveedor de IA configurado. Contacta al administrador de la plataforma.",
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    );
  }

  /* model router (only applies to env-var OpenAI fallback) */
  const recentFallbackCount = conversationHistory
    .slice(-6)
    .filter(m => m.role === "assistant" && m.content.includes("No tengo suficiente información")).length;
  const frustrated = detectFrustration(userMessage);
  const effectiveModel = resolveModel(aiConfig, { retrievalMaxScore, recentFallbackCount, frustrated });

  const configWithModel: HelpChatAIConfig = { ...aiConfig, model: effectiveModel };

  /* build messages (kept in OpenAI format; provider layer converts) */
  const fallback = fallbackMessage(userMessage);
  const todayLabel = new Date().toLocaleString("es-CL", { dateStyle: "full", timeStyle: "short" });

  const MAX_HISTORY_CHARS = 12_000;
  let trimmedHistory = [...conversationHistory];
  let historySize = trimmedHistory.reduce((sum, m) => sum + m.content.length, 0);
  while (historySize > MAX_HISTORY_CHARS && trimmedHistory.length > 2) {
    trimmedHistory = trimmedHistory.slice(2);
    historySize = trimmedHistory.reduce((sum, m) => sum + m.content.length, 0);
  }

  const systemPrompt = buildHelpChatSystemPromptV2({
    fallbackText: fallback,
    allowDataQuestions: cfg.allowDataQuestions,
    todayLabel,
    appBaseUrl,
    retrievalHasEvidence,
    userName: userDisplayName,
    userRole: ctx.userRole,
  });

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `Contexto documental y base de conocimiento relevante:\n${docsContext || "(sin bloques relevantes encontrados)"}` },
    ...trimmedHistory.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const tools = getToolDefinitionsV2(cfg.allowDataQuestions);

  /* SSE response */
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        send("meta", {
          conversationId: conversation?.id ?? null,
          model: effectiveModel,
          provider: aiConfig.providerType,
          persistenceEnabled,
        });

        let fullText = "";
        let toolCallsUsed = 0;
        const completionParams = {
          messages,
          tools,
          temperature: 0.2,
          maxTokens: 1400,
        };

        /* tool-calling loop (max 4 iterations) — always streaming */
        for (let step = 0; step < 4; step += 1) {
          let pendingToolCalls: ToolCallInfo[] = [];
          let hasToolCalls = false;

          for await (const event of createStreamingCompletion(configWithModel, completionParams)) {
            if (event.type === "token") {
              fullText += event.text;
              send("token", { token: event.text });
            }
            if (event.type === "tool_calls") {
              hasToolCalls = true;
              pendingToolCalls = event.calls;
            }
          }

          if (!hasToolCalls || pendingToolCalls.length === 0) {
            break;
          }

          toolCallsUsed += pendingToolCalls.length;
          messages.push({
            role: "assistant",
            content: fullText || null,
            tool_calls: pendingToolCalls.map(tc => ({
              id: tc.id,
              type: "function",
              function: { name: tc.name, arguments: tc.arguments },
            })),
          });

          for (const call of pendingToolCalls) {
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(call.arguments || "{}"); } catch { args = {}; }
            const result = await executeToolCallV2(
              call.name, args, ctx.tenantId, ctx.userId,
              hasCapability(perms, "rendicion_view_all"),
            );
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
          }
          fullText = "";
        }

        /* post-processing */
        let assistantText = normalizeAssistantLinks(fullText || fallbackMessage(userMessage), appBaseUrl);
        const inferredFunctionalAnswer = resolveFunctionalIntent(userMessage, appBaseUrl);
        const assistantUsedFallback = assistantText.includes("No tengo suficiente información para asegurar esto");
        if (
          inferredFunctionalAnswer &&
          (assistantUsedFallback || shouldPreferFunctionalInference(userMessage, assistantText))
        ) {
          assistantText = normalizeAssistantLinks(inferredFunctionalAnswer, appBaseUrl);
        }

        const { cleanText, visuals, suggestions } = parseVisualBlocks(assistantText);
        assistantText = cleanText;

        /* save assistant message */
        let assistantMessageId = `ephemeral-${Date.now()}`;
        if (persistenceEnabled && conversation) {
          const saved = await prisma.aiChatMessage.create({
            data: { conversationId: conversation.id, tenantId: ctx.tenantId, role: "assistant", content: assistantText },
            select: { id: true },
          });
          assistantMessageId = saved.id;
          await prisma.aiChatConversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
          });
        }

        send("done", {
          assistantText,
          visuals,
          suggestions,
          assistantMessageId,
          model: effectiveModel,
          provider: aiConfig.providerType,
          toolCallsUsed,
          latencyMs: Date.now() - t0,
          retrievalTopScore: retrievalMaxScore,
          retrievalChunks: allChunks.length,
          knowledgeBaseChunks: knowledgeChunks.length,
        });

        console.log(
          JSON.stringify({
            event: "ai_help_chat_stream",
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            provider: aiConfig.providerType,
            providerSource: aiConfig.source,
            model: effectiveModel,
            toolCallsUsed,
            retrievalChunks: allChunks.length,
            knowledgeBaseChunks: knowledgeChunks.length,
            retrievalTopScore: retrievalMaxScore,
            fallbackUsed: assistantUsedFallback,
            frustrated,
            latencyMs: Date.now() - t0,
          }),
        );
        logAiUsage({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          providerType: aiConfig.providerType,
          model: effectiveModel,
          feature: "help_chat",
          durationMs: Date.now() - t0,
        });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Error desconocido";
        console.error("Error in AI Help Chat Stream:", errMsg, error);
        send("error", { error: `Error del asistente: ${errMsg.slice(0, 200)}` });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
