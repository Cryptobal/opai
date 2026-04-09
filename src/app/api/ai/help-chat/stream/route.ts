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
  shouldUseInferredAnswerUpfront,
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
 * Mapea un pathname a una descripción humana del módulo actual para
 * inyectarla en el system prompt. Cubre los módulos principales de OPAI:
 * hub, CRM (leads, contactos, cuentas, deals, cotizaciones, instalaciones),
 * Operaciones (pautas, rondas, monitoreo, supervisión, ATS, tickets, puestos,
 * alertas), Personas/Guardias, Finanzas, Payroll, Documentos y Configuración.
 */
function describeModule(pathname: string): string {
  const p = pathname.toLowerCase();
  if (p === "/" || p.startsWith("/hub")) return "Hub / Inicio — dashboard general del tenant";
  if (p.startsWith("/crm/leads") || p.startsWith("/crm/prospecting")) return "CRM > Leads / Prospección comercial";
  if (p.startsWith("/crm/contacts")) return "CRM > Contactos comerciales";
  if (p.startsWith("/crm/accounts")) return "CRM > Cuentas / Clientes";
  if (p.startsWith("/crm/deals")) return "CRM > Deals / Pipeline comercial";
  if (p.startsWith("/crm/cotizaciones") || p.startsWith("/cpq")) return "CRM > Cotizaciones (CPQ)";
  if (p.startsWith("/crm/installations")) return "CRM > Instalaciones";
  if (p.startsWith("/crm")) return "CRM — gestión comercial";
  if (p.startsWith("/ops/rondas/monitoreo")) return "Operaciones > Rondas > Monitoreo en vivo";
  if (p.startsWith("/ops/rondas")) return "Operaciones > Rondas de vigilancia";
  if (p.startsWith("/ops/pautas") || p.startsWith("/ops/pauta")) return "Operaciones > Pauta mensual / asignaciones";
  if (p.startsWith("/ops/supervision")) return "Operaciones > Supervisión en terreno";
  if (p.startsWith("/ops/control-nocturno")) return "Operaciones > Control nocturno";
  if (p.startsWith("/ops/asistencia") || p.startsWith("/ops/marcacion")) return "Operaciones > Asistencia y marcación";
  if (p.startsWith("/ops/ats")) return "Operaciones > ATS (Reclutamiento y selección)";
  if (p.startsWith("/ops/tickets")) return "Operaciones > Tickets / Incidencias";
  if (p.startsWith("/ops/puestos")) return "Operaciones > Puestos operativos";
  if (p.startsWith("/ops/inventario")) return "Operaciones > Inventario operativo";
  if (p.startsWith("/ops/alertas-cobertura")) return "Operaciones > Alertas de cobertura";
  if (p.startsWith("/ops")) return "Operaciones — gestión operativa";
  if (p.startsWith("/personas/guardias")) return "Personas > Guardias / Colaboradores";
  if (p.startsWith("/personas/gamificacion")) return "Personas > Gamificación";
  if (p.startsWith("/personas")) return "Personas — gestión de personal";
  if (p.startsWith("/finanzas/rendiciones")) return "Finanzas > Rendiciones";
  if (p.startsWith("/finanzas/facturacion")) return "Finanzas > Facturación electrónica (DTE)";
  if (p.startsWith("/finanzas/conciliacion")) return "Finanzas > Conciliación bancaria";
  if (p.startsWith("/finanzas/contabilidad")) return "Finanzas > Contabilidad";
  if (p.startsWith("/finanzas")) return "Finanzas — gestión financiera";
  if (p.startsWith("/payroll/parameters")) return "Payroll > Parámetros";
  if (p.startsWith("/payroll/simulator")) return "Payroll > Simulador de sueldos";
  if (p.startsWith("/payroll")) return "Payroll — remuneraciones";
  if (p.startsWith("/opai/documentos")) return "Documentos — contratos, anexos y plantillas";
  if (p.startsWith("/opai/configuracion/ats")) return "Configuración > ATS";
  if (p.startsWith("/opai/configuracion/crm")) return "Configuración > CRM";
  if (p.startsWith("/opai/configuracion/cpq")) return "Configuración > CPQ / Cotizaciones";
  if (p.startsWith("/opai/configuracion/asistente-ia")) return "Configuración > Asistente IA";
  if (p.startsWith("/opai/configuracion")) return "Configuración de la plataforma";
  if (p.startsWith("/opai/usuarios")) return "Configuración > Usuarios y roles";
  if (p.startsWith("/opai")) return "OPAI — administración";
  if (p.startsWith("/chat")) return "Chat interno";
  if (p.startsWith("/portales")) return "Portales externos";
  if (p.startsWith("/reportes")) return "Reportes y analítica";
  if (p.startsWith("/fiscalizacion")) return "Fiscalización";
  if (p.startsWith("/te")) return "Turnos extra";
  return `ruta ${pathname}`;
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
    pageContext?: unknown;
    pathname?: unknown;
  };

  /* page context (Notion-like): the user is currently viewing an entity */
  type PageContext = {
    entityType: string;
    entityId: string;
    entityName: string;
    entityUrl?: string;
    extra?: string;
  };
  let pageContext: PageContext | null = null;
  if (body.pageContext && typeof body.pageContext === "object") {
    const pc = body.pageContext as Record<string, unknown>;
    if (
      typeof pc.entityType === "string" &&
      typeof pc.entityId === "string" &&
      typeof pc.entityName === "string"
    ) {
      pageContext = {
        entityType: pc.entityType,
        entityId: pc.entityId,
        entityName: pc.entityName,
        entityUrl: typeof pc.entityUrl === "string" ? pc.entityUrl : undefined,
        extra: typeof pc.extra === "string" ? pc.extra : undefined,
      };
    }
  }
  const appBaseUrl = request.nextUrl.origin;
  const currentPathname =
    typeof body.pathname === "string" && body.pathname.startsWith("/") ? body.pathname : null;
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

  const pageContextSystemMessage = pageContext
    ? `Contexto de página actual (el usuario está viendo esta entidad en la app):
- Tipo: ${pageContext.entityType}
- ID: ${pageContext.entityId}
- Nombre: ${pageContext.entityName}${pageContext.entityUrl ? `\n- URL: ${pageContext.entityUrl}` : ""}${pageContext.extra ? `\n- Detalle: ${pageContext.extra}` : ""}

REGLAS DE CONTEXTO DE PÁGINA (críticas):
1. Cuando el usuario use referencias ambiguas como "este cliente", "este deal", "esta cotización", "este contrato", "el cliente", "resúmeme esto", asume que se refiere a la entidad de arriba.
2. Si el usuario pide ver/listar/resumir documentos sin especificar de qué entidad, llama get_entity_documents con el entityType e entityId del contexto de página.
3. Si el usuario pide resumir un documento específico (contrato, orden de compra, anexo, protocolo), primero llama get_entity_documents para obtener el documentId más relevante, luego read_document para obtener su texto, y produce un resumen estructurado en 4-6 puntos clave (partes, objeto, vigencia, montos, obligaciones críticas).
4. NO repitas el nombre de la entidad en cada respuesta — el usuario ya sabe qué está viendo. Sé natural.
5. Si el usuario pregunta algo claramente NO relacionado a esta entidad (ej: "qué es UF"), responde normalmente sin forzar el contexto.`
    : null;

  const moduleContextSystemMessage = currentPathname
    ? `Contexto de módulo actual: el usuario está navegando en la ruta ${currentPathname} (${describeModule(currentPathname)}).

REGLAS DE CONTEXTO DE MÓDULO:
1. Si la pregunta es ambigua ("¿cómo creo uno?", "muéstrame los recientes", "¿cómo configuro esto?"), asume que el usuario se refiere al módulo de la ruta actual.
2. Cuando expliques flujos o acciones, prioriza ejemplos, rutas y terminología del módulo actual.
3. En el bloque :::suggestions final prioriza acciones relacionadas a este módulo para mantener al usuario en contexto.
4. No repitas el nombre del módulo en cada frase — sé natural y directo.`
    : null;

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `Contexto documental y base de conocimiento relevante:\n${docsContext || "(sin bloques relevantes encontrados)"}` },
    ...(pageContextSystemMessage ? [{ role: "system", content: pageContextSystemMessage }] : []),
    ...(moduleContextSystemMessage ? [{ role: "system", content: moduleContextSystemMessage }] : []),
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
        let usedInferredAnswer = false;

        // ── Inferred answer upfront ──
        // Para preguntas puramente funcionales (cómo/dónde/qué hace tal módulo)
        // que matchean un intent conocido, servimos directamente la plantilla
        // estructurada SIN llamar al modelo. Antes el server llamaba al AI,
        // streameaba la respuesta natural del AI, y luego en post-procesamiento
        // la reemplazaba por la plantilla — el usuario veía la respuesta del
        // AI flashar y luego ser reemplazada por "Te refieres a X > Y..." (el
        // famoso bug de la "segunda respuesta rara").
        const inferredFunctionalAnswer = resolveFunctionalIntent(userMessage, appBaseUrl);
        if (inferredFunctionalAnswer && shouldUseInferredAnswerUpfront(userMessage)) {
          usedInferredAnswer = true;
          fullText = normalizeAssistantLinks(inferredFunctionalAnswer, appBaseUrl);
          // Stream chunked para que se vea como streaming natural en el cliente.
          const CHUNK_SIZE = 28;
          for (let i = 0; i < fullText.length; i += CHUNK_SIZE) {
            send("token", { token: fullText.slice(i, i + CHUNK_SIZE) });
            // Pequeña pausa para simular el efecto typewriter (no bloqueante).
            await new Promise((resolve) => setTimeout(resolve, 12));
          }
        } else {
          const completionParams = {
            messages,
            tools,
            temperature: 0.2,
            maxTokens: 2800,
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
              send("tool_call", { name: call.name, status: "running" });
              const result = await executeToolCallV2(
                call.name, args, ctx.tenantId, ctx.userId,
                hasCapability(perms, "rendicion_view_all"),
              );
              send("tool_call", { name: call.name, status: "done" });
              messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
            }
            // El texto emitido en esta iteración era solo razonamiento previo a
            // las tool_calls (no la respuesta final). Le decimos al cliente que
            // borre lo que mostró para que la próxima iteración escriba limpio
            // sobre la burbuja en streaming. Sin esto el cliente acumula todas
            // las iteraciones y luego el evento "done" reemplaza con la última,
            // provocando el bug de "primero una respuesta, después otra rara".
            send("reset_stream", {});
            fullText = "";
          }
        }

        /* post-processing */
        let assistantText = normalizeAssistantLinks(fullText || fallbackMessage(userMessage), appBaseUrl);
        const assistantUsedFallback = assistantText.includes("No tengo suficiente información para asegurar esto");

        // Rescate post-stream: si el AI devolvió fallback y tenemos respuesta
        // inferida disponible, limpiamos la burbuja y streameamos la inferida.
        // Solo entra aquí si el camino upfront NO se usó (porque la pregunta
        // no calificó como puramente funcional pero el AI igual fracasó).
        if (
          !usedInferredAnswer &&
          assistantUsedFallback &&
          inferredFunctionalAnswer
        ) {
          send("reset_stream", {});
          assistantText = normalizeAssistantLinks(inferredFunctionalAnswer, appBaseUrl);
          const CHUNK_SIZE = 28;
          for (let i = 0; i < assistantText.length; i += CHUNK_SIZE) {
            send("token", { token: assistantText.slice(i, i + CHUNK_SIZE) });
            await new Promise((resolve) => setTimeout(resolve, 12));
          }
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
