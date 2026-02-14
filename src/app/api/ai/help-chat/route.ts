import { NextRequest, NextResponse } from "next/server";
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

  // "- URL: `/ruta`" -> "- Ingresa acá: [Abrir enlace](https://.../ruta)"
  output = output.replace(
    /-\s*URL:\s*`(\/[^`]+)`/gi,
    (_, path: string) => `- Ingresa acá: [Abrir enlace](${toAbsoluteUrl(path, appBaseUrl)})`,
  );

  // [texto](/ruta) -> [texto](https://.../ruta)
  output = output.replace(
    /\[([^\]]+)\]\((\/[^)\s]+)\)/g,
    (_, label: string, path: string) => `[${label}](${toAbsoluteUrl(path, appBaseUrl)})`,
  );

  // "`/ruta`" -> "[Ingresa acá](https://.../ruta)"
  output = output.replace(
    /`(\/[a-z0-9\-/_[\]]+)`/gi,
    (_, path: string) => `[Ingresa acá](${toAbsoluteUrl(path, appBaseUrl)})`,
  );

  // "( /ruta )" textual -> "(Ingresa acá: [Abrir enlace](https://.../ruta))"
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

type ToolCallResult = {
  toolCallsUsed: number;
  assistantText: string;
};

async function runModelWithTools(params: {
  userMessage: string;
  docsContext: string;
  tenantId: string;
  userId: string;
  allowDataQuestions: boolean;
  canViewAllRendiciones: boolean;
  appBaseUrl: string;
  conversationHistory: Array<{ role: string; content: string }>;
  retrievalHasEvidence: boolean;
  model: string;
}): Promise<ToolCallResult> {
  const {
    userMessage,
    docsContext,
    tenantId,
    userId,
    allowDataQuestions,
    canViewAllRendiciones,
    appBaseUrl,
    conversationHistory,
    retrievalHasEvidence,
    model,
  } = params;
  let toolCallsUsed = 0;
  const fallback = fallbackMessage(userMessage);
  const todayLabel = new Date().toLocaleString("es-CL", {
    dateStyle: "full",
    timeStyle: "short",
  });

  const MAX_HISTORY_CHARS = 12_000;
  // Trim history if too large
  let trimmedHistory = [...conversationHistory];
  let historySize = trimmedHistory.reduce((sum, m) => sum + m.content.length, 0);
  while (historySize > MAX_HISTORY_CHARS && trimmedHistory.length > 2) {
    trimmedHistory = trimmedHistory.slice(2); // Remove oldest pair
    historySize = trimmedHistory.reduce((sum, m) => sum + m.content.length, 0);
  }

  const baseMessages: Array<Record<string, unknown>> = [
    {
      role: "system",
      content: buildHelpChatSystemPrompt({
        fallbackText: fallback,
        allowDataQuestions,
        todayLabel,
        appBaseUrl,
        retrievalHasEvidence,
      }),
    },
    {
      role: "system",
      content: `Contexto documental relevante:\n${docsContext || "(sin bloques relevantes encontrados)"}`,
    },
    ...trimmedHistory.map(m => ({
      role: m.role as string,
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  const tools = allowDataQuestions
    ? [
        {
          type: "function",
          function: {
            name: "search_guardias",
            description:
              "Busca guardias por nombre, apellido, RUT o código para responder preguntas operativas puntuales.",
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
          type: "function",
          function: {
            name: "get_guardias_metrics",
            description: "Obtiene métricas agregadas de guardias del tenant actual.",
            parameters: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "get_uf_utm",
            description:
              "Obtiene UF y UTM actuales desde la base de datos interna del sistema.",
            parameters: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "get_pending_rendiciones",
            description:
              "Obtiene rendiciones pendientes por aprobar (del aprobador actual o de todo el tenant si tiene permiso).",
            parameters: {
              type: "object",
              properties: {
                scope: {
                  type: "string",
                  enum: ["mine", "all"],
                  description: "mine: solo las mías por aprobar; all: todas las pendientes.",
                },
                limit: { type: "number", description: "Cantidad máxima de resultados (1-20)." },
              },
              additionalProperties: false,
            },
          },
        },
      ]
    : [];

  let messages = [...baseMessages];
  let finalText = "";

  for (let step = 0; step < 4; step += 1) {
    const completion = await openai.chat.completions.create({
      model,
      messages: messages as never,
      tools: tools.length > 0 ? (tools as never) : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0.2,
      max_tokens: 1400,
    });

    const choice = completion.choices[0]?.message;
    const toolCalls = choice?.tool_calls ?? [];

    if (!toolCalls.length) {
      finalText = choice?.content?.trim() || "";
      break;
    }

    toolCallsUsed += toolCalls.length;
    messages.push({
      role: "assistant",
      content: choice?.content ?? "",
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      if (call.type !== "function") {
        continue;
      }
      const toolName = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
      } catch {
        args = {};
      }
      let result: unknown = { ok: false, error: "Herramienta no soportada" };

      if (toolName === "search_guardias") {
        const query = typeof args.query === "string" ? args.query : "";
        const limit = typeof args.limit === "number" ? args.limit : 8;
        try {
          result = {
            ok: true,
            data: await searchGuardiasByNameOrRut(tenantId, query, limit),
          };
        } catch {
          result = {
            ok: false,
            error: "No fue posible consultar guardias en este momento.",
          };
        }
      } else if (toolName === "get_guardias_metrics") {
        try {
          result = {
            ok: true,
            data: await getGuardiasMetrics(tenantId),
          };
        } catch {
          result = {
            ok: false,
            error: "No fue posible consultar métricas en este momento.",
          };
        }
      } else if (toolName === "get_uf_utm") {
        try {
          result = {
            ok: true,
            data: await getUfUtmIndicators(),
          };
        } catch {
          result = {
            ok: false,
            error: "No fue posible consultar UF/UTM en este momento.",
          };
        }
      } else if (toolName === "get_pending_rendiciones") {
        const scope = args.scope === "all" && canViewAllRendiciones ? "all" : "mine";
        const limit = typeof args.limit === "number" ? args.limit : 8;
        try {
          result = {
            ok: true,
            data: await getPendingRendicionesForApproval({
              tenantId,
              userId,
              includeAll: scope === "all",
              limit,
            }),
          };
        } catch {
          result = {
            ok: false,
            error: "No fue posible consultar rendiciones pendientes en este momento.",
          };
        }
      }

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }
  }

  return { toolCallsUsed, assistantText: finalText };
}

export async function POST(request: NextRequest) {
  try {
    const t0 = Date.now();
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    const cfg = await getAiHelpChatConfig(ctx.tenantId);
    if (!canUseAiHelpChat(ctx.userRole, cfg)) {
      return NextResponse.json(
        { success: false, error: "No tienes acceso al asistente" },
        { status: 403 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      message?: unknown;
      conversationId?: unknown;
    };
    const appBaseUrl = request.nextUrl.origin;

    const userMessage = typeof body.message === "string" ? body.message.trim() : "";
    if (!userMessage) {
      return NextResponse.json(
        { success: false, error: "El mensaje es obligatorio" },
        { status: 400 },
      );
    }

    const persistenceEnabled = hasChatPersistence();
    const existingConversationId =
      persistenceEnabled && typeof body.conversationId === "string" ? body.conversationId : undefined;

    const conversation = persistenceEnabled
      ? existingConversationId
        ? await prisma.aiChatConversation.findFirst({
            where: {
              id: existingConversationId,
              tenantId: ctx.tenantId,
              userId: ctx.userId,
            },
          })
        : await prisma.aiChatConversation.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              title: clipTitle(userMessage),
            },
          })
      : null;

    if (persistenceEnabled && !conversation) {
      return NextResponse.json(
        { success: false, error: "No se encontró la conversación" },
        { status: 404 },
      );
    }

    if (persistenceEnabled && conversation) {
      await prisma.aiChatMessage.create({
        data: {
          conversationId: conversation.id,
          tenantId: ctx.tenantId,
          role: "user",
          content: userMessage,
        },
      });
    }

    // Load conversation history for multi-turn context
    let conversationHistory: Array<{ role: string; content: string }> = [];
    if (persistenceEnabled && conversation) {
      const historyMessages = await prisma.aiChatMessage.findMany({
        where: { conversationId: conversation.id },
        select: { role: true, content: true, createdAt: true },
        orderBy: [{ createdAt: "asc" }],
        take: 24,
      });
      // Exclude the message we just saved (the current user message) since it'll be added separately
      conversationHistory = historyMessages
        .slice(0, -1) // Remove the last one (current message, just saved above)
        .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));
    }

    const docsChunks = await retrieveDocsContext(userMessage, 6);
    const docsContext = docsChunks
      .map(
        (item, index) =>
          `Bloque ${index + 1} (${item.title}):\n${item.body}`,
      )
      .join("\n\n");

    /* ── Siempre ejecuta el modelo (ya tiene contexto funcional base + docs si hay) ── */
    const retrievalHasEvidence = docsChunks.length > 0;
    const retrievalMaxScore = docsChunks.length > 0 ? Math.max(...docsChunks.map(c => c.score)) : 0;
    const recentFallbackCount = conversationHistory
      .slice(-6)
      .filter(m => m.role === "assistant" && m.content.includes("No tengo suficiente información")).length;
    const frustrated = detectFrustration(userMessage);
    const model = chooseModel({ retrievalMaxScore, recentFallbackCount, frustrated });
    const modelResult = await runModelWithTools({
      userMessage,
      docsContext,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      allowDataQuestions: cfg.allowDataQuestions,
      canViewAllRendiciones: hasCapability(perms, "rendicion_view_all"),
      appBaseUrl,
      conversationHistory,
      retrievalHasEvidence,
      model,
    });
    let assistantText = normalizeAssistantLinks(
      modelResult.assistantText || fallbackMessage(userMessage),
      appBaseUrl,
    );
    const inferredFunctionalAnswer = resolveFunctionalIntent(userMessage, appBaseUrl);
    const assistantUsedFallback = assistantText.includes("No tengo suficiente información para asegurar esto");
    if (
      inferredFunctionalAnswer &&
      (assistantUsedFallback || shouldPreferFunctionalInference(userMessage, assistantText))
    ) {
      assistantText = normalizeAssistantLinks(inferredFunctionalAnswer, appBaseUrl);
    }

    const assistantMessage =
      persistenceEnabled && conversation
        ? await prisma.aiChatMessage.create({
            data: {
              conversationId: conversation.id,
              tenantId: ctx.tenantId,
              role: "assistant",
              content: assistantText,
            },
            select: {
              id: true,
              role: true,
              content: true,
              createdAt: true,
            },
          })
        : {
            id: `ephemeral-${Date.now()}`,
            role: "assistant" as const,
            content: assistantText,
            createdAt: new Date(),
          };

    if (persistenceEnabled && conversation) {
      await prisma.aiChatConversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      });
    }

    console.log(
      JSON.stringify({
        event: "ai_help_chat",
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        model,
        toolCallsUsed: modelResult.toolCallsUsed,
        retrievalChunks: docsChunks.length,
        retrievalTopScore: retrievalMaxScore,
        fallbackUsed: assistantUsedFallback,
        frustrated,
        latencyMs: Date.now() - t0,
      }),
    );

    return NextResponse.json({
      success: true,
      data: {
        conversationId: conversation?.id ?? null,
        assistantMessage,
        assistantText: assistantText,
        persistenceEnabled,
      },
    });
  } catch (error) {
    console.error("Error in AI Help Chat:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo responder la consulta" },
      { status: 500 },
    );
  }
}
