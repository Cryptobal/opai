import { NextRequest, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, resolveApiPerms, unauthorized } from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import {
  canUseAiHelpChat,
  getAiHelpChatConfig,
  pickAgentInstructionsForPrompt,
} from "@/lib/ai/help-chat-config";
import { retrieveDocsContext, retrieveTemplatesContext } from "@/lib/ai/help-chat-retrieval";
import {
  getToolDefinitionsV2,
  executeToolCallV2,
  WRITE_TOOL_NAMES,
} from "@/lib/ai/help-chat-tools-v2";
import {
  PENDING_TTL_MS,
  decideWriteDeferral,
  type PendingConfirmation,
} from "@/lib/ai/help-chat-defer-writes";
import { buildUserMessage, type MultimodalAttachment } from "@/lib/ai/help-chat-multimodal";
import { buildAttachmentsContext } from "@/lib/ai/help-chat-attachments-context";
import type { HelpChatPageContext } from "@/lib/ai/help-chat-page-context";
import { pageContextToAnchor } from "@/lib/ai/help-chat-anchor";
import {
  buildLeadSystemMessage,
  buildLicitacionSystemMessage,
  LICITACION_PREVIEW_TOOLS,
} from "@/lib/ai/help-chat-licitacion-handlers";
import { buildHelpChatSystemPromptV2 } from "@/lib/ai/help-chat-system-prompt-v2";
import { parseVisualBlocks } from "@/lib/ai/help-chat-visual-types";
import {
  hasWriteIntent,
  resolveFunctionalIntent,
  shouldUseInferredAnswerUpfront,
} from "@/lib/ai/help-chat-intents";
import { detectFrustration } from "@/lib/ai/help-chat-model-router";
import { searchKnowledge } from "@/lib/knowledge/search";
import {
  fallbackMessage,
  normalizeAssistantLinks,
  resolveEffectiveModel,
  trimHistory,
} from "@/lib/ai/help-chat-shared";
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

function clipTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Nueva conversación";
  return clean.length > 90 ? `${clean.slice(0, 87)}...` : clean;
}

/** Clave estable de args para deduplicar tool calls de escritura en un turno. */
function stableToolArgsKey(args: Record<string, unknown>): string {
  const keys = Object.keys(args).sort();
  const normalized: Record<string, unknown> = {};
  for (const k of keys) normalized[k] = args[k];
  try {
    return JSON.stringify(normalized);
  } catch {
    return String(callFallbackArgs(args));
  }
}

function callFallbackArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("&");
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
  if (p.startsWith("/crm/leads")) return "CRM > Leads";
  if (p.startsWith("/crm/contacts")) return "CRM > Contactos comerciales";
  if (p.startsWith("/crm/accounts")) return "CRM > Cuentas / Clientes";
  if (p.startsWith("/crm/deals")) return "CRM > Deals / Pipeline comercial";
  if (p.startsWith("/crm/cotizaciones") || p.startsWith("/cpq")) return "CRM > Cotizaciones (CPQ)";
  if (p.startsWith("/crm/installations")) return "CRM > Instalaciones";
  if (p.startsWith("/crm/correos")) return "CRM > Correos (bandeja Gmail)";
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
  if (p.startsWith("/ops/turnos-extra")) return "Turnos extra";
  return `ruta ${pathname}`;
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
    attachments?: unknown;
  };

  /* Adjuntos del chat web: referencias livianas al staging de R2 (subidas por
   * /api/ai/help-chat/attachments). El binario se reconstruye server-side desde
   * la stagedKey; aquí solo llegan metadatos. */
  const attachmentRefs = (Array.isArray(body.attachments) ? body.attachments : [])
    .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>) : {}))
    .map((a) => ({
      stagedKey: typeof a.stagedKey === "string" ? a.stagedKey : "",
      fileName: typeof a.fileName === "string" ? a.fileName : "archivo",
      mimeType: typeof a.mimeType === "string" ? a.mimeType : "",
    }))
    .filter((a) => a.stagedKey.includes("chat-staged") && a.mimeType)
    .slice(0, 4);

  /* page context (Notion-like): the user is currently viewing an entity */
  type PageContext = HelpChatPageContext;
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
        conversationId: typeof pc.conversationId === "string" ? pc.conversationId : undefined,
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
  let savedUserMessage: { id: string } | null = null;
  const anchor = pageContextToAnchor(pageContext);
  if (persistenceEnabled) {
    conversation = existingConversationId
      ? await prisma.aiChatConversation.findFirst({
          where: { id: existingConversationId, tenantId: ctx.tenantId, userId: ctx.userId },
        })
      : await prisma.aiChatConversation.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            title: clipTitle(userMessage),
            ...(anchor ? { anchorType: anchor.type, anchorId: anchor.id } : {}),
          },
        });
    if (conversation && anchor) {
      await prisma.aiChatConversation.updateMany({
        where: { id: conversation.id, tenantId: ctx.tenantId, anchorType: null },
        data: { anchorType: anchor.type, anchorId: anchor.id },
      });
    }
  }

  if (pageContext && conversation) {
    pageContext.conversationId = conversation.id;
  }

  if (persistenceEnabled && !conversation) {
    return new Response(JSON.stringify({ success: false, error: "No se encontró la conversación" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  /* save user message (con sus adjuntos en metadata para reinyectarlos en turnos futuros) */
  if (persistenceEnabled && conversation) {
    savedUserMessage = await prisma.aiChatMessage.create({
      data: {
        conversationId: conversation.id,
        tenantId: ctx.tenantId,
        role: "user",
        content: userMessage,
        ...(attachmentRefs.length > 0 ? { metadata: { attachments: attachmentRefs } } : {}),
      },
      select: { id: true },
    });
  }

  /* load conversation history */
  let conversationHistory: Array<{ role: string; content: string }> = [];
  /* Adjuntos de turnos anteriores del hilo: el archivo subido a una conversación
   * queda disponible TODO el hilo (manifiesto + texto extraído cacheado). Vive
   * fuera del if para existir siempre (vacío sin persistencia). */
  type ThreadAttachment = { stagedKey: string; fileName: string; mimeType: string; extractedText?: string };
  const threadAttachments: ThreadAttachment[] = [];
  if (persistenceEnabled && conversation) {
    const historyMessages = await prisma.aiChatMessage.findMany({
      where: { conversationId: conversation.id },
      select: { role: true, content: true, createdAt: true, metadata: true },
      orderBy: [{ createdAt: "asc" }],
      take: 24,
    });
    conversationHistory = historyMessages.slice(0, -1).map((m: { role: string; content: string }) => ({ role: m.role, content: m.content }));

    const seen = new Set(attachmentRefs.map((a) => a.stagedKey));
    for (const m of historyMessages.slice(0, -1)) {
      const meta = m.metadata as { attachments?: Array<Record<string, unknown>> } | null;
      for (const a of meta?.attachments ?? []) {
        const stagedKey = typeof a.stagedKey === "string" ? a.stagedKey : "";
        if (!stagedKey || seen.has(stagedKey)) continue;
        seen.add(stagedKey);
        threadAttachments.push({
          stagedKey,
          fileName: typeof a.fileName === "string" ? a.fileName : "archivo",
          mimeType: typeof a.mimeType === "string" ? a.mimeType : "",
          extractedText: typeof a.extractedText === "string" ? a.extractedText : undefined,
        });
      }
    }
    // Conserva los 6 más recientes del hilo (los últimos en orden cronológico).
    if (threadAttachments.length > 6) threadAttachments.splice(0, threadAttachments.length - 6);
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
  const writeIntent = cfg.allowWrites && hasWriteIntent(userMessage);
  const effectiveModel = resolveEffectiveModel(aiConfig, { retrievalMaxScore, recentFallbackCount, frustrated, writeIntent });

  const configWithModel: HelpChatAIConfig = { ...aiConfig, model: effectiveModel };

  /* Adjuntos del turno actual + del hilo: el helper reconstruye visión
   * (imágenes/PDF) y texto extraído (Excel/Word/PDF). El texto de turnos previos
   * viene cacheado en metadata (sin re-bajar de R2). Ver help-chat-attachments-context. */
  const { visionAttachments, attachmentsContext, freshExtractions } =
    attachmentRefs.length > 0 || threadAttachments.length > 0
      ? await buildAttachmentsContext({ attachmentRefs, threadAttachments })
      : {
          visionAttachments: [] as MultimodalAttachment[],
          attachmentsContext: null as string | null,
          freshExtractions: [] as Array<{ stagedKey: string; extractedText: string }>,
        };

  /* Cachea best-effort el texto extraído del turno actual en el mensaje user para
   * reinyectarlo en turnos siguientes. JAMÁS rompe el stream por esto. */
  if (savedUserMessage && freshExtractions.length > 0) {
    const savedId = savedUserMessage.id;
    const enriched = attachmentRefs.map((r) => {
      const extractedText = freshExtractions.find((f) => f.stagedKey === r.stagedKey)?.extractedText?.slice(0, 12_000);
      return extractedText ? { ...r, extractedText } : { ...r };
    });
    void prisma.aiChatMessage
      .update({ where: { id: savedId }, data: { metadata: { attachments: enriched } } })
      .catch((e) => console.error("[help-chat] cache de extractedText falló:", e));
  }
  const hasAttachments = visionAttachments.length > 0 || attachmentsContext !== null;

  /* build messages (kept in OpenAI format; provider layer converts) */
  const fallback = fallbackMessage();
  const todayLabel = new Date().toLocaleString("es-CL", { dateStyle: "full", timeStyle: "short" });

  const trimmedHistory = trimHistory(conversationHistory);

  const systemPrompt = buildHelpChatSystemPromptV2({
    fallbackText: fallback,
    allowDataQuestions: cfg.allowDataQuestions,
    todayLabel,
    appBaseUrl,
    retrievalHasEvidence,
    userName: userDisplayName,
    userRole: ctx.userRole,
    agentInstructions: pickAgentInstructionsForPrompt(cfg.agents, currentPathname),
  });

  const pageContextSystemMessage = pageContext
    ? `Contexto de página actual (el usuario está viendo esta entidad en la app):
- Tipo: ${pageContext.entityType}
- ID: ${pageContext.entityId}
- Nombre: ${pageContext.entityName}${pageContext.entityUrl ? `\n- URL: ${pageContext.entityUrl}` : ""}${pageContext.extra ? `\n- Detalle: ${pageContext.extra}` : ""}

REGLAS DE CONTEXTO DE PÁGINA (críticas):
1. Cuando el usuario use referencias ambiguas como "este cliente", "este deal", "esta cotización", "este contrato", "este correo", "este mail", "el mail en pantalla", "el cliente", "resúmeme esto", asume que se refiere a la entidad de arriba.
2. Si el usuario pide ver/listar/resumir documentos sin especificar de qué entidad, llama get_entity_documents con el entityType e entityId del contexto de página.
3. Si el usuario pide resumir un documento específico (contrato, orden de compra, anexo, protocolo), primero llama get_entity_documents para obtener el documentId más relevante, luego read_document para obtener su texto, y produce un resumen estructurado en 4-6 puntos clave (partes, objeto, vigencia, montos, obligaciones críticas).
4. NO repitas el nombre de la entidad en cada respuesta — el usuario ya sabe qué está viendo. Sé natural.
5. Si el usuario pregunta algo claramente NO relacionado a esta entidad (ej: "qué es UF"), responde normalmente sin forzar el contexto.
${
  pageContext.entityType === "crm_email_thread"
    ? `
REGLAS EXTRA — CORREO EN PANTALLA (crm_email_thread):
A. El ID de arriba ES el threadId. El correo YA ESTÁ ABIERTO en pantalla. PROHIBIDO decir "abre el correo", "el mail no está cargado", "copiá/pegá el contenido" o "pasame el threadId". Si necesitás el cuerpo, llamá get_email_thread (o summarize_email_thread / read_email_attachments) YA — sin pedir nada al usuario.
B. Para "créame cuenta/instalación/contacto/deal", "muéstrame qué crearías", "estructura desde este mail/RFI": usá create_crm_from_email SIN confirm (extrae adjuntos sola). Mostrá previewCards + coverageTable + totales/openQuestions y pedí OK. Al confirmar: create_crm_from_email({confirm:true, proposal}).
C. create_lead_from_email solo si pide explícitamente un LEAD. create_account/contact/deal/installation sueltos solo si el usuario corrige una pieza puntual después.
D. No inventes RUT, montos ni direcciones. Cobertura ≠ dotación: si el RFI lo dice, explicalo y mostrá la dotación propuesta.
E. Nunca pidas al usuario un dato que esté en el correo abierto (email, nombre, cargo, empresa, teléfono, sitio web, dirección, lo que pide el cliente, cambios a una cotización, números de HES/OC en capturas). Si falta, llamá get_email_thread y, si hay adjuntos/imágenes, read_email_attachments (ya incluye visión). Sólo preguntá después de haber leído.
F. El From puede ser una dirección propia de la empresa (grupos/alias tipo "… via Comercial") y puede traer el nombre del cliente delante. La contraparte real es counterparty; Reply-To manda sobre From. NUNCA propongas una dirección de ownAddresses/ownDomains como email de contacto ni derives de ella el dominio del cliente.
G. Prohibido inventar emails (nombre@dominio construido). Si tras leer el hilo y sus adjuntos no hay email verificable, decilo explícitamente y ofrecé crear sólo la cuenta.
H. "Creá la cuenta y el contacto" con correo en pantalla = una llamada a create_crm_from_email sin confirm → una propuesta → una confirmación. No emitas create_account y create_contact como pendientes separados.
I. ACTUALIZAR BORRADOR DE PROGRAMACIÓN DESDE EL MAIL: si pide actualizar un borrador programado / de Programación con HES/OC de la imagen del correo → (1) read_email_attachments YA (visión → visionExtract.hes/oc/pedido), (2) search_invoice_drafts con el nombre del cliente/instalación (NO search_quotes), (3) preview_update_invoice_draft_refs → confirmación → update_invoice_draft_refs. "Para pedido" = OC. PROHIBIDO decir que no podés leer imágenes o que no podés editar borradores existentes.`
    : ""
}`
    : null;

  const moduleContextSystemMessage = currentPathname
    ? `Contexto de módulo actual: el usuario está navegando en la ruta ${currentPathname} (${describeModule(currentPathname)}).

REGLAS DE CONTEXTO DE MÓDULO:
1. Si la pregunta es ambigua ("¿cómo creo uno?", "muéstrame los recientes", "¿cómo configuro esto?"), asume que el usuario se refiere al módulo de la ruta actual.
2. Cuando expliques flujos o acciones, prioriza ejemplos, rutas y terminología del módulo actual.
3. En el bloque :::suggestions final prioriza acciones relacionadas a este módulo para mantener al usuario en contexto.
4. No repitas el nombre del módulo en cada frase — sé natural y directo.`
    : null;

  let emailThreadContextMessage: string | null = null;
  if (pageContext?.entityType === "crm_email_thread" && pageContext.entityId) {
    try {
      const { buildEmailThreadAiContext } = await import(
        "@/lib/ai/help-chat-email-context"
      );
      emailThreadContextMessage = await buildEmailThreadAiContext({
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        threadId: pageContext.entityId,
      });
    } catch {
      emailThreadContextMessage = null;
    }
  }

  const licitacionContextMessage = await buildLicitacionSystemMessage({
    tenantId: ctx.tenantId,
    pageContext,
  }).catch(() => null);
  const leadContextMessage = await buildLeadSystemMessage({
    tenantId: ctx.tenantId,
    pageContext,
  }).catch(() => null);

  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: systemPrompt },
    { role: "system", content: `Contexto documental y base de conocimiento relevante:\n${docsContext || "(sin bloques relevantes encontrados)"}` },
    ...(pageContextSystemMessage ? [{ role: "system", content: pageContextSystemMessage }] : []),
    ...(emailThreadContextMessage
      ? [{ role: "system", content: emailThreadContextMessage }]
      : []),
    ...(licitacionContextMessage ? [{ role: "system", content: licitacionContextMessage }] : []),
    ...(leadContextMessage ? [{ role: "system", content: leadContextMessage }] : []),
    ...(moduleContextSystemMessage ? [{ role: "system", content: moduleContextSystemMessage }] : []),
    ...(attachmentsContext ? [{ role: "system", content: attachmentsContext }] : []),
    ...trimmedHistory.map(m => ({ role: m.role, content: m.content })),
    buildUserMessage(userMessage, visionAttachments, aiConfig.providerType),
  ];

  const allowWrites = cfg.allowWrites;
  const tools = getToolDefinitionsV2(cfg.allowDataQuestions, allowWrites);

  /* SSE response.
   * En iPad/iOS Safari, al salir de la app el fetch se corta ("Load failed").
   * La generación NO debe morir con el cliente: send() se vuelve no-op si el
   * socket cayó, after() mantiene viva la isolate en Vercel, y el mensaje
   * assistant se persiste igual para que el cliente lo rehidrate al volver. */
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let clientGone = request.signal.aborted;
      const markClientGone = () => {
        clientGone = true;
      };
      request.signal.addEventListener("abort", markClientGone, { once: true });

      function send(event: string, data: unknown) {
        if (clientGone) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          clientGone = true;
        }
      }

      const work = (async () => {
      try {
        send("meta", {
          conversationId: conversation?.id ?? null,
          model: effectiveModel,
          provider: aiConfig.providerType,
          persistenceEnabled,
        });

        let fullText = "";
        let reasoningText = "";
        const tReasonStart = Date.now();
        let toolCallsUsed = 0;
        let usedInferredAnswer = false;
        const deferredPendings: PendingConfirmation[] = [];
        /** Evita crear el mismo registro N veces si el modelo repite la tool en un turno. */
        const seenWriteKeys = new Set<string>();

        // ── Inferred answer upfront ──
        // Para preguntas puramente funcionales (cómo/dónde/qué hace tal módulo)
        // que matchean un intent conocido, servimos directamente la plantilla
        // estructurada SIN llamar al modelo. Antes el server llamaba al AI,
        // streameaba la respuesta natural del AI, y luego en post-procesamiento
        // la reemplazaba por la plantilla — el usuario veía la respuesta del
        // AI flashar y luego ser reemplazada por "Te refieres a X > Y..." (el
        // famoso bug de la "segunda respuesta rara").
        const inferredFunctionalAnswer = resolveFunctionalIntent(userMessage, appBaseUrl);
        if (inferredFunctionalAnswer && shouldUseInferredAnswerUpfront(userMessage) && !hasAttachments) {
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

          /* tool-calling loop — always streaming.
           * MAX_TOOL_STEPS cubre flujos multi-paso (crear cuenta → contacto →
           * instalación → deal → cotización → varios puestos → margen). Antes
           * el tope era 4: cuando un flujo necesitaba más rondas, el loop salía
           * con tool_calls aún pendientes y fullText vacío, y el post-proceso
           * caía al fallbackMessage ("No tengo datos específicos...") aunque las
           * acciones SÍ se habían ejecutado. Ese era el bug del "bucle de
           * fallback" en cotizaciones largas. */
          const MAX_TOOL_STEPS = 12;
          let exhaustedWithPendingTools = false;
          for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
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

              let result: unknown;
              // Chat web: ejecutar escrituras al pedirlas (el mensaje del usuario
              // ya es el consentimiento). Slack sigue diferiendo vía runner.
              // Solo se encolarían pendings si deferWrites volviera a true.
              const writeKey = WRITE_TOOL_NAMES.has(call.name)
                ? `${call.name}:${stableToolArgsKey(args)}`
                : null;
              if (writeKey && seenWriteKeys.has(writeKey)) {
                result = {
                  ok: true,
                  executed: false,
                  status: "duplicate_skipped",
                  message:
                    "Misma escritura ya procesada en este turno; no se repite para evitar duplicados.",
                };
              } else {
                if (writeKey) seenWriteKeys.add(writeKey);
                const licitacionDefer =
                  LICITACION_PREVIEW_TOOLS.has(call.name) ||
                  call.name === "licitacion_aplicar_indice" ||
                  call.name === "licitacion_aplicar_cambio" ||
                  call.name === "licitacion_regenerar_seccion" ||
                  call.name === "propuesta_editar_seccion";
                const pre = decideWriteDeferral({
                  toolName: call.name,
                  args,
                  allowWrites,
                  pendingCount: deferredPendings.length,
                  deferWrites: licitacionDefer,
                });

                if (pre.kind === "defer" || pre.kind === "limit") {
                  if (pre.kind === "defer") deferredPendings.push(pre.pending);
                  result = pre.toolResult;
                } else {
                  result = await executeToolCallV2(
                    call.name, args, ctx.tenantId, ctx.userId,
                    perms,
                    hasCapability(perms, "rendicion_view_all"),
                    pageContext,
                  );
                  const post = decideWriteDeferral({
                    toolName: call.name,
                    args,
                    allowWrites,
                    pendingCount: deferredPendings.length,
                    executedResult: result as { ok?: boolean },
                    deferWrites: licitacionDefer,
                  });
                  if (post.kind === "defer") deferredPendings.push(post.pending);
                  else if (post.kind === "limit") result = post.toolResult;
                }
              }

              send("tool_call", { name: call.name, status: "done" });
              messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
            }
            // El texto de esta iteración era razonamiento previo a las tool_calls,
            // no la respuesta final. En vez de borrarlo de la burbuja (parpadeo),
            // lo movemos al bloque de progreso: el cliente lo reubica sin destruirlo.
            if (fullText.trim()) {
              reasoningText += (reasoningText ? "\n\n" : "") + fullText.trim();
            }
            send("stash_reasoning", { text: fullText });
            fullText = "";

            // Si esta fue la última iteración permitida y el modelo todavía
            // quería seguir llamando tools, marcamos para hacer un cierre
            // SIN tools (abajo) en vez de caer al fallback.
            if (step === MAX_TOOL_STEPS - 1) {
              exhaustedWithPendingTools = true;
            }
          }

          // Cierre cuando se agotó el presupuesto de tool-steps con acciones ya
          // ejecutadas: pedimos al modelo que redacte el resumen final SIN
          // tools (tool_choice queda en undefined cuando tools=[]), usando el
          // historial que ya contiene todos los resultados ok:true. Así el
          // usuario ve un cierre coherente ("Listo, creé X, Y, Z...") en lugar
          // del fallback genérico.
          if (exhaustedWithPendingTools && !fullText.trim()) {
            for await (const event of createStreamingCompletion(configWithModel, {
              ...completionParams,
              tools: [],
            })) {
              if (event.type === "token") {
                fullText += event.text;
                send("token", { token: event.text });
              }
            }
          }
        }

        /* post-processing */
        let assistantText = normalizeAssistantLinks(fullText || fallbackMessage(), appBaseUrl);
        const assistantUsedFallback = assistantText.includes("No tengo datos específicos para responder eso con certeza");

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

        /* Persist pending confirmations (web) — espejo de SlackPendingAction */
        type ClientPending = {
          id: string;
          confirmToolName: string;
          summary: string;
          status: string;
          expiresAt: string;
        };
        const clientPendings: ClientPending[] = [];
        const hasPendingModel = Boolean((prisma as unknown as Record<string, unknown>).aiPendingAction);
        if (allowWrites && deferredPendings.length > 0 && hasPendingModel) {
          const expiresAt = new Date(Date.now() + PENDING_TTL_MS);
          for (const pc of deferredPendings) {
            const row = await prisma.aiPendingAction.create({
              data: {
                tenantId: ctx.tenantId,
                userId: ctx.userId,
                conversationId: conversation?.id ?? null,
                kind: "TOOL_CONFIRM",
                toolName: pc.confirmToolName,
                toolArgs: pc.args as object,
                summary: pc.summary,
                status: "PENDING",
                expiresAt,
              },
              select: { id: true, expiresAt: true },
            });
            clientPendings.push({
              id: row.id,
              confirmToolName: pc.confirmToolName,
              summary: pc.summary,
              status: "PENDING",
              expiresAt: row.expiresAt.toISOString(),
            });
          }
        }

        const reasoning =
          reasoningText.length > 4000
            ? `${reasoningText.slice(0, 3999)}…`
            : reasoningText;
        const reasoningMs = reasoning ? Date.now() - tReasonStart : undefined;

        /* save assistant message (+ visuals / suggestions / pendings / reasoning en metadata) */
        let assistantMessageId = `ephemeral-${Date.now()}`;
        if (persistenceEnabled && conversation) {
          const metadata: Record<string, unknown> = {};
          if (visuals.length) metadata.visuals = visuals;
          if (suggestions.length) metadata.suggestions = suggestions;
          if (clientPendings.length) metadata.pendingConfirmations = clientPendings;
          if (reasoning) {
            metadata.reasoning = reasoning;
            if (reasoningMs != null) metadata.reasoningMs = reasoningMs;
          }

          const saved = await prisma.aiChatMessage.create({
            data: {
              conversationId: conversation.id,
              tenantId: ctx.tenantId,
              role: "assistant",
              content: assistantText,
              ...(Object.keys(metadata).length
                ? { metadata: metadata as import("@prisma/client").Prisma.InputJsonValue }
                : {}),
            },
            select: { id: true },
          });
          assistantMessageId = saved.id;
          if (clientPendings.length && hasPendingModel) {
            await prisma.aiPendingAction.updateMany({
              where: { id: { in: clientPendings.map((p) => p.id) } },
              data: { messageId: assistantMessageId },
            });
          }
          await prisma.aiChatConversation.update({
            where: { id: conversation.id },
            data: { updatedAt: new Date() },
          });
        }

        send("done", {
          assistantText,
          visuals,
          suggestions,
          pendingConfirmations: clientPendings,
          assistantMessageId,
          model: effectiveModel,
          provider: aiConfig.providerType,
          toolCallsUsed,
          latencyMs: Date.now() - t0,
          retrievalTopScore: retrievalMaxScore,
          retrievalChunks: allChunks.length,
          knowledgeBaseChunks: knowledgeChunks.length,
          ...(reasoning ? { reasoning, reasoningMs } : {}),
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
        request.signal.removeEventListener("abort", markClientGone);
        try {
          controller.close();
        } catch {
          // ya cerrado por disconnect del cliente
        }
      }
      })();

      // Mantiene la ejecución aunque el cliente (iPad/Safari) cierre el SSE.
      after(() => work);
      await work;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      // El cliente lee esto si el body se corta antes del event: meta.
      ...(conversation?.id
        ? { "X-Opai-Conversation-Id": conversation.id }
        : {}),
    },
  });
}
