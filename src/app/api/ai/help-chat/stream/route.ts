import { NextRequest } from "next/server";
import { openai } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { canUseAiHelpChat, getAiHelpChatConfig } from "@/lib/ai/help-chat-config";
import { retrieveDocsContext } from "@/lib/ai/help-chat-retrieval";
import {
  getGuardiasMetrics,
  getPendingRendicionesForApproval,
  getUfUtmIndicators,
  searchGuardiasByNameOrRut,
} from "@/lib/ai/help-chat-tools";
import { buildHelpChatSystemPrompt } from "@/lib/ai/help-chat-system-prompt";
import {
  resolveFunctionalIntent,
  shouldPreferFunctionalInference,
} from "@/lib/ai/help-chat-intents";
import { chooseModel, detectFrustration } from "@/lib/ai/help-chat-model-router";

/* ── helpers (shared with main route) ── */

function hasChatPersistence(): boolean {
  const db = prisma as unknown as Record<string, unknown>;
  return Boolean(db.aiChatConversation && db.aiChatMessage);
}

function fallbackMessage(question: string): string {
  return `No tengo suficiente información para asegurar esto. ¿Quieres que te deje la pregunta para hacerla al administrador? Cópiala y pégala tal cual: "${question}"`;
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

/* ── tool definitions (same as main route) ── */

function getToolDefinitions(allowDataQuestions: boolean) {
  if (!allowDataQuestions) return [];
  return [
    {
      type: "function" as const,
      function: {
        name: "search_guardias",
        description: "Busca guardias por nombre, apellido, RUT o código para responder preguntas operativas puntuales.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda (nombre, RUT o código)." },
            limit: { type: "number", description: "Cantidad máxima de resultados (1-20)." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_guardias_metrics",
        description: "Obtiene métricas agregadas de guardias del tenant actual.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_uf_utm",
        description: "Obtiene UF y UTM actuales desde la base de datos interna del sistema.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_pending_rendiciones",
        description: "Obtiene rendiciones pendientes por aprobar (del aprobador actual o de todo el tenant si tiene permiso).",
        parameters: {
          type: "object",
          properties: {
            scope: { type: "string", enum: ["mine", "all"], description: "mine: solo las mías por aprobar; all: todas las pendientes." },
            limit: { type: "number", description: "Cantidad máxima de resultados (1-20)." },
          },
          additionalProperties: false,
        },
      },
    },
  ];
}

/* ── tool executor ── */

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string,
  userId: string,
  canViewAllRendiciones: boolean,
): Promise<unknown> {
  if (toolName === "search_guardias") {
    const query = typeof args.query === "string" ? args.query : "";
    const limit = typeof args.limit === "number" ? args.limit : 8;
    try {
      return { ok: true, data: await searchGuardiasByNameOrRut(tenantId, query, limit) };
    } catch {
      return { ok: false, error: "No fue posible consultar guardias en este momento." };
    }
  }
  if (toolName === "get_guardias_metrics") {
    try {
      return { ok: true, data: await getGuardiasMetrics(tenantId) };
    } catch {
      return { ok: false, error: "No fue posible consultar métricas en este momento." };
    }
  }
  if (toolName === "get_uf_utm") {
    try {
      return { ok: true, data: await getUfUtmIndicators() };
    } catch {
      return { ok: false, error: "No fue posible consultar UF/UTM en este momento." };
    }
  }
  if (toolName === "get_pending_rendiciones") {
    const scope = args.scope === "all" && canViewAllRendiciones ? "all" : "mine";
    const limit = typeof args.limit === "number" ? args.limit : 8;
    try {
      return {
        ok: true,
        data: await getPendingRendicionesForApproval({ tenantId, userId, includeAll: scope === "all", limit }),
      };
    } catch {
      return { ok: false, error: "No fue posible consultar rendiciones pendientes en este momento." };
    }
  }
  return { ok: false, error: "Herramienta no soportada" };
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

  /* retrieval */
  const docsChunks = await retrieveDocsContext(userMessage, 6);
  const docsContext = docsChunks
    .map((item, index) => `Bloque ${index + 1} (${item.title}):\n${item.body}`)
    .join("\n\n");
  const retrievalHasEvidence = docsChunks.length > 0;
  const retrievalMaxScore = docsChunks.length > 0 ? Math.max(...docsChunks.map(c => c.score)) : 0;

  /* model router */
  const recentFallbackCount = conversationHistory
    .slice(-6)
    .filter(m => m.role === "assistant" && m.content.includes("No tengo suficiente información")).length;
  const frustrated = detectFrustration(userMessage);
  const model = chooseModel({ retrievalMaxScore, recentFallbackCount, frustrated });

  /* build messages */
  const fallback = fallbackMessage(userMessage);
  const todayLabel = new Date().toLocaleString("es-CL", { dateStyle: "full", timeStyle: "short" });

  const MAX_HISTORY_CHARS = 12_000;
  let trimmedHistory = [...conversationHistory];
  let historySize = trimmedHistory.reduce((sum, m) => sum + m.content.length, 0);
  while (historySize > MAX_HISTORY_CHARS && trimmedHistory.length > 2) {
    trimmedHistory = trimmedHistory.slice(2);
    historySize = trimmedHistory.reduce((sum, m) => sum + m.content.length, 0);
  }

  const systemPrompt = buildHelpChatSystemPrompt({
    fallbackText: fallback,
    allowDataQuestions: cfg.allowDataQuestions,
    todayLabel,
    appBaseUrl,
    retrievalHasEvidence,
  });

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `Contexto documental relevante:\n${docsContext || "(sin bloques relevantes encontrados)"}` },
    ...trimmedHistory.map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];

  const tools = getToolDefinitions(cfg.allowDataQuestions);

  /* SSE response */
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      }

      try {
        /* send metadata immediately */
        send("meta", { conversationId: conversation?.id ?? null, model, persistenceEnabled });

        let fullText = "";
        let toolCallsUsed = 0;

        /* tool-calling loop (max 4 iterations) */
        for (let step = 0; step < 4; step += 1) {
          const isLastOrTextStep = step > 0; // after first tool round, try streaming

          if (isLastOrTextStep || tools.length === 0) {
            /* streaming call */
            const streamResponse = await openai.chat.completions.create({
              model,
              messages: messages as never,
              tools: tools.length > 0 ? (tools as never) : undefined,
              tool_choice: tools.length > 0 ? "auto" : undefined,
              temperature: 0.2,
              max_tokens: 1400,
              stream: true,
            });

            let streamedToolCalls: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }> = [];
            let hasToolCalls = false;

            for await (const chunk of streamResponse) {
              const delta = chunk.choices[0]?.delta;
              if (!delta) continue;

              /* handle tool calls in stream */
              if (delta.tool_calls) {
                hasToolCalls = true;
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!streamedToolCalls[idx]) {
                    streamedToolCalls[idx] = {
                      id: tc.id || "",
                      type: tc.type || "function",
                      function: { name: tc.function?.name || "", arguments: "" },
                    };
                  }
                  if (tc.id) streamedToolCalls[idx].id = tc.id;
                  if (tc.function?.name) streamedToolCalls[idx].function.name = tc.function.name;
                  if (tc.function?.arguments) streamedToolCalls[idx].function.arguments += tc.function.arguments;
                }
                continue;
              }

              /* stream text tokens */
              const token = delta.content;
              if (token) {
                fullText += token;
                send("token", { token });
              }
            }

            /* if tool calls came back, execute them and continue loop */
            if (hasToolCalls && streamedToolCalls.length > 0) {
              toolCallsUsed += streamedToolCalls.length;
              messages.push({
                role: "assistant",
                content: fullText || null,
                tool_calls: streamedToolCalls,
              });

              for (const call of streamedToolCalls) {
                let args: Record<string, unknown> = {};
                try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
                const result = await executeToolCall(
                  call.function.name, args, ctx.tenantId, ctx.userId,
                  hasCapability(perms, "rendicion_view_all"),
                );
                messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
              }
              fullText = ""; // reset for next iteration
              continue;
            }

            /* no more tool calls — we're done */
            break;
          }

          /* first step: non-streaming call to check for tool calls */
          const completion = await openai.chat.completions.create({
            model,
            messages: messages as never,
            tools: tools.length > 0 ? (tools as never) : undefined,
            tool_choice: tools.length > 0 ? "auto" : undefined,
            temperature: 0.2,
            max_tokens: 1400,
          });

          const choice = completion.choices[0]?.message;
          const callList = choice?.tool_calls ?? [];

          if (!callList.length) {
            /* no tool calls, send the text */
            fullText = choice?.content?.trim() || "";
            for (const token of fullText) {
              send("token", { token });
            }
            break;
          }

          /* execute tool calls */
          toolCallsUsed += callList.length;
          messages.push({
            role: "assistant",
            content: choice?.content ?? "",
            tool_calls: callList,
          });

          for (const call of callList) {
            if (call.type !== "function") continue;
            let args: Record<string, unknown> = {};
            try { args = JSON.parse(call.function.arguments || "{}"); } catch { args = {}; }
            const result = await executeToolCall(
              call.function.name, args, ctx.tenantId, ctx.userId,
              hasCapability(perms, "rendicion_view_all"),
            );
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
          }
          /* loop continues → next iteration will stream */
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

        /* send final event with normalized text */
        send("done", {
          assistantText,
          assistantMessageId,
          model,
          toolCallsUsed,
          latencyMs: Date.now() - t0,
          retrievalTopScore: retrievalMaxScore,
          retrievalChunks: docsChunks.length,
        });

        /* observability log */
        console.log(
          JSON.stringify({
            event: "ai_help_chat_stream",
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            model,
            toolCallsUsed,
            retrievalChunks: docsChunks.length,
            retrievalTopScore: retrievalMaxScore,
            fallbackUsed: assistantUsedFallback,
            frustrated,
            latencyMs: Date.now() - t0,
          }),
        );
      } catch (error) {
        console.error("Error in AI Help Chat Stream:", error);
        send("error", { error: "No se pudo responder la consulta" });
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
