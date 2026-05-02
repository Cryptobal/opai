/**
 * Herramientas del asistente IA — V2 (incluye CRM, Ops, Finanzas, sistema).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayChileStr } from "@/lib/fx-date";
import {
  getGuardiasMetrics,
  getPendingRendicionesForApproval,
  getUfUtmIndicators,
  searchGuardiasByNameOrRut,
} from "@/lib/ai/help-chat-tools";
import { getFileBuffer } from "@/lib/storage";
import { extractText } from "@/lib/knowledge/extract";
import {
  createLeadSchema,
  createAccountSchema,
  createContactSchema,
  createDealSchema,
} from "@/lib/validations/crm";
import { toSentenceCase } from "@/lib/text-format";
import { canEdit, type RolePermissions } from "@/lib/permissions";

function baseToolDefinitions() {
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

function v2ToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "search_accounts",
        description: "Busca cuentas CRM (clientes/prospectos) por nombre o RUT; devuelve industria y conteos de instalaciones y negocios.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda." },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_deals",
        description: "Busca negocios (deals) del CRM por nombre, cuenta o etapa; incluye monto y fechas.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda (nombre del deal o cuenta)." },
            status: { type: "string", description: "Filtrar por status del deal (ej. open)." },
            limit: { type: "number" },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_deal_pipeline",
        description: "Resumen del pipeline: etapas con conteos/montos y negocios ganados/perdidos recientes (~30 días).",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_installations",
        description: "Busca instalaciones por nombre o dirección; incluye supervisor asignado si existe.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_daily_attendance",
        description: "Resumen de asistencia diaria por instalación para una fecha (PPC/TE vía snapshot y turnos extra).",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD (Chile). Omite para hoy." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_supervision_visits",
        description: "Visitas de supervisión agrupadas por supervisor y semana.",
        parameters: {
          type: "object",
          properties: {
            weeks_back: { type: "number", description: "Semanas hacia atrás (default 3)." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_rondas_status",
        description: "Estado de rondas: ejecuciones por status, programaciones activas y alertas abiertas para una fecha.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD centrado en ventana del día." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_tickets_summary",
        description: "Resumen de tickets Ops: conteos por estado, vencidos SLA y recientes.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_finance_summary",
        description: "Resumen financiero: rendiciones y DTEs por estado en los últimos N días.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "number", description: "Días hacia atrás (default 30)." },
          },
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_user_context",
        description: "Contexto del usuario actual: nombre, rol y plantilla de rol.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_tenant_summary",
        description: "Conteos globales del tenant: usuarios, cuentas, instalaciones, guardias, deals, tickets.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_guardia_detail",
        description:
          "Ficha completa de un guardia: datos personales (RUT, email, teléfono, dirección, fecha nacimiento, AFP, salud), datos previsionales y cuentas bancarias. Buscá por nombre/apellido/RUT/código.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre, apellido, RUT o código del guardia." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_guardia_documents",
        description:
          "Lista los documentos de un guardia (OS10, contrato, anexos, certificados, etc.). Devuelve link directo al archivo y a la pantalla de la app. Filtrá por tipo si querés.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre, RUT o código del guardia." },
            type: {
              type: "string",
              description:
                "Filtro por tipo de documento (ej: 'OS10', 'contrato', 'anexo', 'certificado'). Opcional.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_account_detail",
        description:
          "Ficha completa de una cuenta CRM (cliente o prospecto): nombre, RUT, razón social, representante legal, dirección, web, industria, contactos principales, instalaciones.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre, razón social o RUT del cliente." },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "list_account_documents",
        description:
          "Lista los documentos asociados a una cuenta CRM (contratos de servicio, anexos, etc.) con link clickeable a la pantalla del documento y al PDF si existe.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre, razón social o RUT del cliente." },
            category: {
              type: "string",
              description:
                "Filtro por categoría (ej: 'contrato_servicio', 'anexo'). Opcional.",
            },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_panic_alerts",
        description:
          "Lista las alertas de pánico (botón de pánico) generadas en una fecha. Incluye instalación, guardia que la activó, mensaje, severidad y estado de resolución.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD. Omite para hoy." },
            days_back: {
              type: "number",
              description: "En vez de una fecha exacta, mira los últimos N días. Default 1 (solo hoy).",
            },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_daily_absences",
        description:
          "Lista guardias ausentes en una fecha (asistencia con status 'ausente' o sin check-in). Incluye instalación, puesto y nombre del guardia esperado.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD. Omite para hoy." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_extra_shifts",
        description:
          "Lista turnos extra del día con guardia, instalación, monto y estado (pending/approved/paid).",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD. Omite para hoy." },
            status: { type: "string", description: "Filtrar por estado (pending|approved|paid|rejected)." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_quotes",
        description:
          "Busca cotizaciones (CPQ) por código, nombre, cliente o estado. Devuelve link clickeable a la cotización en la app.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto a buscar (código, nombre o cliente). Opcional." },
            status: { type: "string", description: "Filtrar por estado (draft, sent, accepted, etc.). Opcional." },
            limit: { type: "number", description: "Cantidad máxima (1-25)." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_contacts",
        description: "Busca contactos CRM por nombre, email o cargo; incluye la cuenta asociada.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda (nombre, email o cargo)." },
            limit: { type: "number", description: "Cantidad máxima de resultados (1-20)." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_all",
        description:
          "Búsqueda unificada: busca un término en TODAS las entidades del CRM en paralelo (cuentas, deals, cotizaciones, instalaciones, contactos y guardias). Úsala cuando el usuario escriba un nombre, código o término suelto y quieras encontrar TODO lo relacionado de una sola vez.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda." },
            limit: { type: "number", description: "Máximo de resultados por tipo (1-10). Default 5." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_entity_documents",
        description:
          "Lista los documentos asociados a una entidad (cliente, deal, instalación, contacto). Útil cuando el usuario pide ver o resumir contratos, anexos u órdenes de un cliente. Devuelve documentId, título, categoría, estado y fecha. Para leer el contenido de un documento usa read_document.",
        parameters: {
          type: "object",
          properties: {
            entityType: {
              type: "string",
              enum: ["crm_account", "crm_deal", "crm_installation", "crm_contact"],
              description: "Tipo de entidad. Si el usuario está viendo una ficha y dice 'este cliente' / 'este deal', usa el contexto de página.",
            },
            entityId: { type: "string", description: "UUID de la entidad." },
            limit: { type: "number", description: "Máximo 20." },
          },
          required: ["entityType", "entityId"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "read_document",
        description:
          "Lee el contenido de texto plano de un documento (contrato, anexo, protocolo) almacenado en OPAI. Úsalo cuando el usuario pida resumir, explicar o buscar información dentro de un documento. Devuelve título, categoría, estado y el texto completo extraído. El texto puede estar truncado a 12.000 caracteres.",
        parameters: {
          type: "object",
          properties: {
            documentId: { type: "string", description: "UUID del documento (obtenido de get_entity_documents)." },
          },
          required: ["documentId"],
          additionalProperties: false,
        },
      },
    },
  ];
}

function writeToolDefinitions() {
  return [
    {
      type: "function" as const,
      function: {
        name: "create_lead",
        description:
          "Crea un nuevo lead/prospecto en el CRM. Usa cuando el usuario pida explícitamente crear/registrar un lead, prospecto o oportunidad nueva. Requiere al menos uno de: companyName, firstName+lastName, email o phone. Si faltan todos, pregunta al usuario antes de llamar.",
        parameters: {
          type: "object",
          properties: {
            companyName: { type: "string", description: "Razón social o nombre de la empresa." },
            firstName: { type: "string", description: "Nombre del contacto." },
            lastName: { type: "string", description: "Apellido del contacto." },
            email: { type: "string", description: "Email de contacto." },
            phone: { type: "string", description: "Teléfono de contacto (formato libre)." },
            source: { type: "string", description: "Origen del lead (ej: web, referido, evento)." },
            industry: { type: "string", description: "Industria/rubro del prospecto." },
            address: { type: "string" },
            commune: { type: "string" },
            city: { type: "string" },
            website: { type: "string" },
            serviceType: { type: "string", description: "Tipo de servicio de seguridad solicitado." },
            notes: { type: "string", description: "Notas u observaciones." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_account",
        description:
          "Crea una nueva cuenta CRM (prospecto o cliente). Usa cuando el usuario pida crear/registrar una cuenta, empresa o cliente nuevo. El campo 'name' es OBLIGATORIO. Si no lo tienes, pregunta antes de llamar.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nombre comercial de la cuenta. OBLIGATORIO." },
            type: { type: "string", enum: ["prospect", "client"], description: "Por defecto prospect." },
            rut: { type: "string", description: "RUT de la empresa." },
            legalName: { type: "string", description: "Razón social legal." },
            industry: { type: "string" },
            segment: { type: "string" },
            website: { type: "string" },
            address: { type: "string" },
            commune: { type: "string" },
            notes: { type: "string" },
          },
          required: ["name"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_contact",
        description:
          "Crea un nuevo contacto asociado a una cuenta CRM existente. Usa cuando el usuario pida agregar un contacto a una cuenta. Requiere accountId (UUID), firstName, lastName y email. Si el usuario menciona la cuenta por nombre y no por ID, llama search_accounts primero para obtener el accountId.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "UUID de la cuenta. OBTÉNLO con search_accounts si el usuario solo dio el nombre." },
            firstName: { type: "string", description: "Nombre. OBLIGATORIO." },
            lastName: { type: "string", description: "Apellido. OBLIGATORIO." },
            email: { type: "string", description: "Email. OBLIGATORIO." },
            phone: { type: "string" },
            roleTitle: { type: "string", description: "Cargo o rol del contacto." },
            isPrimary: { type: "boolean", description: "Si es contacto principal." },
          },
          required: ["accountId", "firstName", "lastName", "email"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "create_deal",
        description:
          "Crea un nuevo deal/oportunidad de negocio asociado a una cuenta. Requiere accountId (UUID). Si el usuario solo dio el nombre de la cuenta, llama search_accounts primero. Sugiere title si el usuario no lo provee.",
        parameters: {
          type: "object",
          properties: {
            accountId: { type: "string", description: "UUID de la cuenta. OBLIGATORIO." },
            title: { type: "string", description: "Nombre del deal." },
            amount: { type: "number", description: "Monto en CLP." },
            probability: { type: "number", description: "Probabilidad 0-100." },
            expectedCloseDate: { type: "string", description: "Fecha esperada de cierre (ISO YYYY-MM-DD)." },
          },
          required: ["accountId"],
          additionalProperties: false,
        },
      },
    },
  ];
}

export function getToolDefinitionsV2(allowDataQuestions: boolean, allowWrites: boolean = false) {
  if (!allowDataQuestions) return [];
  const reads = [...baseToolDefinitions(), ...v2ToolDefinitions()];
  return allowWrites ? [...reads, ...writeToolDefinitions()] : reads;
}

async function executeLegacyTool(
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
  return null;
}

async function toolSearchAccounts(tenantId: string, query: string, limit: number) {
  const q = query.trim();
  const take = Math.max(1, Math.min(limit || 10, 20));
  const where: Prisma.CrmAccountWhereInput = { tenantId };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { legalName: { contains: q, mode: "insensitive" } },
      { rut: { contains: q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.crmAccount.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      industry: true,
      status: true,
      type: true,
      _count: { select: { installations: true, deals: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    industry: r.industry,
    status: r.status,
    type: r.type,
    installations: r._count.installations,
    deals: r._count.deals,
    url: `/crm/accounts/${r.id}`,
  }));
}

async function toolSearchDeals(tenantId: string, query: string | undefined, status: string | undefined, limit: number) {
  const take = Math.max(1, Math.min(limit || 12, 25));
  const where: Prisma.CrmDealWhereInput = { tenantId };
  if (status) where.status = status;
  const q = (query || "").trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { account: { name: { contains: q, mode: "insensitive" } } },
      { account: { legalName: { contains: q, mode: "insensitive" } } },
    ];
  }
  const rows = await prisma.crmDeal.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      amount: true,
      status: true,
      expectedCloseDate: true,
      updatedAt: true,
      account: { select: { name: true } },
      stage: { select: { name: true, isClosedWon: true, isClosedLost: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    amount: Number(r.amount),
    status: r.status,
    accountName: r.account.name,
    stageName: r.stage.name,
    stageClosedWon: r.stage.isClosedWon,
    stageClosedLost: r.stage.isClosedLost,
    expectedClose: r.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
    updatedAt: r.updatedAt.toISOString(),
    url: `/crm/deals/${r.id}`,
  }));
}

async function toolGetDealPipeline(tenantId: string) {
  const stages = await prisma.crmPipelineStage.findMany({
    where: { tenantId, isActive: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true, color: true, isClosedWon: true, isClosedLost: true },
  });
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [dealsByStage, wonLast30, lostLast30] = await Promise.all([
    prisma.crmDeal.groupBy({
      by: ["stageId"],
      where: { tenantId },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.crmDeal.aggregate({
      where: { tenantId, updatedAt: { gte: since }, stage: { isClosedWon: true } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.crmDeal.aggregate({
      where: { tenantId, updatedAt: { gte: since }, stage: { isClosedLost: true } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const stageMap = new Map(dealsByStage.map((d) => [d.stageId, { count: d._count.id, amount: Number(d._sum.amount ?? 0) }]));

  return {
    stages: stages.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      dealCount: stageMap.get(s.id)?.count ?? 0,
      totalAmount: stageMap.get(s.id)?.amount ?? 0,
    })),
    last30Days: {
      won: { count: wonLast30._count._all, amount: Number(wonLast30._sum.amount ?? 0) },
      lost: { count: lostLast30._count._all, amount: Number(lostLast30._sum.amount ?? 0) },
    },
  };
}

async function toolSearchInstallations(tenantId: string, query: string, limit: number) {
  const q = query.trim();
  const take = Math.max(1, Math.min(limit || 10, 20));
  const where: Prisma.CrmInstallationWhereInput = {
    tenantId,
    OR: [
      { name: { contains: q, mode: "insensitive" } },
      { address: { contains: q, mode: "insensitive" } },
      { city: { contains: q, mode: "insensitive" } },
    ],
  };
  const rows = await prisma.crmInstallation.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      status: true,
      city: true,
      account: { select: { name: true } },
      supervisorAssignments: {
        where: { isActive: true },
        take: 1,
        select: {
          supervisor: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    city: r.city,
    accountName: r.account?.name ?? null,
    supervisor: r.supervisorAssignments[0]?.supervisor
      ? {
          id: r.supervisorAssignments[0].supervisor.id,
          name: r.supervisorAssignments[0].supervisor.name,
          email: r.supervisorAssignments[0].supervisor.email,
        }
      : null,
    url: `/crm/installations/${r.id}`,
  }));
}

async function toolSearchContacts(tenantId: string, query: string, limit: number) {
  const q = query.trim();
  const take = Math.max(1, Math.min(limit || 10, 20));
  const where: Prisma.CrmContactWhereInput = {
    tenantId,
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { roleTitle: { contains: q, mode: "insensitive" } },
      { account: { name: { contains: q, mode: "insensitive" } } },
    ],
  };
  const rows = await prisma.crmContact.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      roleTitle: true,
      isPrimary: true,
      account: { select: { id: true, name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim(),
    email: r.email,
    phone: r.phone,
    role: r.roleTitle,
    isPrimary: r.isPrimary,
    accountId: r.account.id,
    accountName: r.account.name,
    url: `/crm/accounts/${r.account.id}`,
  }));
}

async function toolSearchAll(
  tenantId: string,
  query: string,
  limitPerType: number,
) {
  const q = query.trim();
  if (!q) return { accounts: [], deals: [], quotes: [], installations: [], contacts: [], guardias: [] };
  const lim = Math.max(1, Math.min(limitPerType || 5, 10));

  const [accounts, deals, quotes, installations, contacts, guardias] = await Promise.all([
    toolSearchAccounts(tenantId, q, lim),
    toolSearchDeals(tenantId, q, undefined, lim),
    toolSearchQuotes(tenantId, q, undefined, lim),
    toolSearchInstallations(tenantId, q, lim),
    toolSearchContacts(tenantId, q, lim),
    searchGuardiasByNameOrRut(tenantId, q, lim).catch(() => []),
  ]);

  return { accounts, deals, quotes, installations, contacts, guardias };
}

async function toolGetDailyAttendance(tenantId: string, dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  const [byInstallation, ppcSnap, teCounts] = await Promise.all([
    prisma.opsAsistenciaDiaria.groupBy({
      by: ["installationId", "attendanceStatus"],
      where: { tenantId, date: d },
      _count: { id: true },
    }),
    prisma.opsPpcSnapshot.findUnique({
      where: { tenantId_date: { tenantId, date: d } },
    }),
    prisma.opsTurnoExtra.groupBy({
      by: ["status"],
      where: { tenantId, date: d },
      _count: { id: true },
    }),
  ]);

  const instIds = [...new Set(byInstallation.map((x) => x.installationId))];
  const instNames =
    instIds.length > 0
      ? await prisma.crmInstallation.findMany({
          where: { id: { in: instIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = Object.fromEntries(instNames.map((i) => [i.id, i.name]));

  const grouped: Record<string, { installationName: string; byStatus: Record<string, number> }> = {};
  for (const row of byInstallation) {
    const id = row.installationId;
    if (!grouped[id]) {
      grouped[id] = { installationName: nameById[id] ?? id, byStatus: {} };
    }
    grouped[id].byStatus[row.attendanceStatus] = row._count.id;
  }

  return {
    date: dateStr,
    byInstallation: Object.values(grouped),
    ppcSnapshot: ppcSnap
      ? {
          totalPpc: ppcSnap.totalPpc,
          totalGuards: ppcSnap.totalGuards,
          ppcPercentage: ppcSnap.ppcPercentage,
        }
      : null,
    turnosExtraByStatus: Object.fromEntries(teCounts.map((t) => [t.status, t._count.id])),
  };
}

function weekKey(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() - day + 1);
  return x.toISOString().slice(0, 10);
}

async function toolGetSupervisionVisits(tenantId: string, weeksBack: number) {
  const since = new Date();
  since.setDate(since.getDate() - 7 * Math.max(1, Math.min(weeksBack || 3, 12)));

  const visits = await prisma.opsVisitaSupervision.findMany({
    where: { tenantId, checkInAt: { gte: since } },
    select: {
      id: true,
      checkInAt: true,
      supervisorId: true,
      installationId: true,
      status: true,
      supervisor: { select: { name: true } },
    },
    orderBy: { checkInAt: "desc" },
    take: 400,
  });

  const grouped: Record<string, Record<string, number>> = {};
  for (const v of visits) {
    const sup = v.supervisor.name;
    const wk = weekKey(v.checkInAt);
    if (!grouped[sup]) grouped[sup] = {};
    grouped[sup][wk] = (grouped[sup][wk] ?? 0) + 1;
  }

  return { since: since.toISOString(), bySupervisorWeek: grouped, sampleSize: visits.length };
}

async function toolGetRondasStatus(tenantId: string, dateStr: string) {
  const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
  const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

  const [byStatus, programmed, openAlerts] = await Promise.all([
    prisma.opsRondaEjecucion.groupBy({
      by: ["status"],
      where: {
        tenantId,
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      _count: { id: true },
    }),
    prisma.opsRondaProgramacion.count({
      where: { tenantId, isActive: true },
    }),
    prisma.opsAlertaRonda.count({
      where: { tenantId, resuelta: false },
    }),
  ]);

  return {
    date: dateStr,
    ejecucionesByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
    programacionesActivas: programmed,
    alertasAbiertas: openAlerts,
  };
}

async function toolGetTicketsSummary(tenantId: string) {
  const [byStatus, overdue, recent] = await Promise.all([
    prisma.opsTicket.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: { id: true },
    }),
    prisma.opsTicket.count({
      where: {
        tenantId,
        slaBreached: true,
        status: { notIn: ["closed", "resolved", "cancelled"] },
      },
    }),
    prisma.opsTicket.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        code: true,
        title: true,
        status: true,
        priority: true,
        createdAt: true,
      },
    }),
  ]);

  return {
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count.id])),
    slaOverdueOpen: overdue,
    recent: recent.map((t) => ({
      code: t.code,
      title: t.title,
      status: t.status,
      priority: t.priority,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

async function toolGetFinanceSummary(tenantId: string, daysBack: number) {
  const since = new Date();
  since.setDate(since.getDate() - Math.max(1, Math.min(daysBack || 30, 365)));
  since.setHours(0, 0, 0, 0);

  const [rendByStatus, rendSum, dteByPay, dteSum] = await Promise.all([
    prisma.financeRendicion.groupBy({
      by: ["status"],
      where: { tenantId, createdAt: { gte: since } },
      _count: { id: true },
      _sum: { amount: true },
    }),
    prisma.financeRendicion.aggregate({
      where: { tenantId, createdAt: { gte: since } },
      _sum: { amount: true },
    }),
    prisma.financeDte.groupBy({
      by: ["paymentStatus"],
      where: { tenantId, createdAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.financeDte.aggregate({
      where: { tenantId, createdAt: { gte: since } },
      _sum: { totalAmount: true },
    }),
  ]);

  return {
    since: since.toISOString(),
    rendiciones: {
      byStatus: Object.fromEntries(
        rendByStatus.map((r) => [r.status, { count: r._count.id, amount: r._sum.amount ?? 0 }]),
      ),
      totalAmount: rendSum._sum.amount ?? 0,
    },
    dtes: {
      byPaymentStatus: Object.fromEntries(dteByPay.map((r) => [String(r.paymentStatus), r._count.id])),
      totalAmount: Number(dteSum._sum.totalAmount ?? 0),
    },
  };
}

async function toolGetUserContext(tenantId: string, userId: string) {
  const admin = await prisma.admin.findFirst({
    where: { id: userId, tenantId },
    select: {
      name: true,
      email: true,
      role: true,
      roleTemplate: { select: { name: true, slug: true, permissions: true } },
    },
  });
  if (!admin) return { ok: false, error: "Usuario no encontrado" };
  return {
    ok: true,
    data: {
      name: admin.name,
      email: admin.email,
      role: admin.role,
      roleTemplate: admin.roleTemplate
        ? { name: admin.roleTemplate.name, slug: admin.roleTemplate.slug }
        : null,
      hasCustomPermissions: Boolean(admin.roleTemplate?.permissions),
    },
  };
}

async function toolGetTenantSummary(tenantId: string) {
  const [
    users,
    accounts,
    installations,
    guardias,
    deals,
    tickets,
  ] = await Promise.all([
    prisma.admin.count({ where: { tenantId, status: "active" } }),
    prisma.crmAccount.count({ where: { tenantId } }),
    prisma.crmInstallation.count({ where: { tenantId } }),
    prisma.opsGuardia.count({ where: { tenantId } }),
    prisma.crmDeal.count({ where: { tenantId } }),
    prisma.opsTicket.count({ where: { tenantId } }),
  ]);

  return {
    users,
    crmAccounts: accounts,
    installations,
    guardias,
    deals,
    tickets,
  };
}

/* ───────── Detail / document tools ───────── */

async function findGuardiaByQuery(tenantId: string, query: string) {
  const q = query.trim();
  if (!q) return null;
  return prisma.opsGuardia.findFirst({
    where: {
      tenantId,
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { persona: { firstName: { contains: q, mode: "insensitive" } } },
        { persona: { lastName: { contains: q, mode: "insensitive" } } },
        { persona: { rut: { contains: q, mode: "insensitive" } } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      lifecycleStatus: true,
      hiredAt: true,
      currentInstallation: { select: { id: true, name: true } },
      persona: {
        select: {
          firstName: true,
          lastName: true,
          rut: true,
          email: true,
          personalEmail: true,
          phone: true,
          phoneMobile: true,
          addressFormatted: true,
          commune: true,
          city: true,
          region: true,
          birthDate: true,
          sex: true,
          nacionalidad: true,
          afp: true,
          healthSystem: true,
          isapreName: true,
        },
      },
      bankAccounts: {
        orderBy: [{ isDefault: "desc" }],
        select: {
          bankName: true,
          accountType: true,
          accountNumber: true,
          holderName: true,
          holderRut: true,
          isDefault: true,
        },
      },
    },
  });
}

async function toolGetGuardiaDetail(tenantId: string, query: string) {
  const g = await findGuardiaByQuery(tenantId, query);
  if (!g) return { ok: false, error: "No encontré ningún guardia con esa búsqueda." };
  return {
    ok: true,
    data: {
      id: g.id,
      code: g.code,
      url: `/personas/guardias/${g.id}`,
      lifecycleStatus: g.lifecycleStatus,
      hiredAt: g.hiredAt,
      instalacionActual: g.currentInstallation
        ? { id: g.currentInstallation.id, name: g.currentInstallation.name, url: `/crm/installations/${g.currentInstallation.id}` }
        : null,
      persona: {
        nombre: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
        rut: g.persona.rut,
        email: g.persona.email,
        emailPersonal: g.persona.personalEmail,
        telefono: g.persona.phone,
        celular: g.persona.phoneMobile,
        direccion: g.persona.addressFormatted,
        comuna: g.persona.commune,
        ciudad: g.persona.city,
        region: g.persona.region,
        fechaNacimiento: g.persona.birthDate,
        sexo: g.persona.sex,
        nacionalidad: g.persona.nacionalidad,
        afp: g.persona.afp,
        sistemaSalud: g.persona.healthSystem,
        isapre: g.persona.isapreName,
      },
      cuentasBancarias: g.bankAccounts.map((b) => ({
        banco: b.bankName,
        tipoCuenta: b.accountType,
        numeroCuenta: b.accountNumber,
        titular: b.holderName,
        rutTitular: b.holderRut,
        principal: b.isDefault,
      })),
    },
  };
}

async function toolListGuardiaDocuments(tenantId: string, query: string, type?: string) {
  const g = await findGuardiaByQuery(tenantId, query);
  if (!g) return { ok: false, error: "No encontré ningún guardia con esa búsqueda." };
  const where: Prisma.OpsDocumentoPersonaWhereInput = { tenantId, guardiaId: g.id };
  if (type && type.trim()) {
    where.type = { contains: type.trim(), mode: "insensitive" };
  }
  const docs = await prisma.opsDocumentoPersona.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    take: 30,
    select: {
      id: true,
      type: true,
      fileUrl: true,
      fileName: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
    },
  });
  return {
    ok: true,
    data: {
      guardia: {
        id: g.id,
        nombre: `${g.persona.firstName} ${g.persona.lastName}`.trim(),
        rut: g.persona.rut,
        url: `/personas/guardias/${g.id}`,
      },
      documentos: docs.map((d) => ({
        id: d.id,
        tipo: d.type,
        nombreArchivo: d.fileName,
        estado: d.status,
        emitido: d.issuedAt,
        vence: d.expiresAt,
        // Link directo al archivo (R2/storage) y a la pantalla del guardia
        archivoUrl: d.fileUrl,
        verEnApp: `/personas/guardias/${g.id}`,
      })),
    },
  };
}

async function findAccountByQuery(tenantId: string, query: string) {
  const q = query.trim();
  if (!q) return null;
  return prisma.crmAccount.findFirst({
    where: {
      tenantId,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { legalName: { contains: q, mode: "insensitive" } },
        { rut: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      rut: true,
      legalName: true,
      legalRepresentativeName: true,
      legalRepresentativeRut: true,
      industry: true,
      segment: true,
      type: true,
      status: true,
      website: true,
      address: true,
      commune: true,
      contacts: {
        take: 5,
        orderBy: { createdAt: "desc" },
        select: { id: true, firstName: true, lastName: true, email: true, phone: true, roleTitle: true },
      },
      installations: {
        take: 10,
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true },
      },
    },
  });
}

async function toolGetAccountDetail(tenantId: string, query: string) {
  const a = await findAccountByQuery(tenantId, query);
  if (!a) return { ok: false, error: "No encontré ninguna cuenta con esa búsqueda." };
  return {
    ok: true,
    data: {
      id: a.id,
      url: `/crm/accounts/${a.id}`,
      nombre: a.name,
      rut: a.rut,
      razonSocial: a.legalName,
      representanteLegal: a.legalRepresentativeName,
      rutRepresentanteLegal: a.legalRepresentativeRut,
      industria: a.industry,
      segmento: a.segment,
      tipo: a.type,
      estado: a.status,
      web: a.website,
      direccion: a.address,
      comuna: a.commune,
      contactos: a.contacts.map((c) => ({
        id: c.id,
        nombre: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(),
        email: c.email,
        telefono: c.phone,
        cargo: c.roleTitle,
      })),
      instalaciones: a.installations.map((i) => ({
        id: i.id,
        nombre: i.name,
        url: `/crm/installations/${i.id}`,
      })),
    },
  };
}

async function toolListAccountDocuments(
  tenantId: string,
  query: string,
  category?: string,
) {
  const a = await findAccountByQuery(tenantId, query);
  if (!a) return { ok: false, error: "No encontré ninguna cuenta con esa búsqueda." };
  const where: Prisma.DocumentWhereInput = {
    tenantId,
    associations: { some: { entityType: "crm_account", entityId: a.id } },
  };
  if (category && category.trim()) where.category = { contains: category.trim(), mode: "insensitive" };
  const docs = await prisma.document.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: {
      id: true,
      title: true,
      module: true,
      category: true,
      status: true,
      effectiveDate: true,
      expirationDate: true,
      pdfUrl: true,
      signatureStatus: true,
    },
  });
  return {
    ok: true,
    data: {
      cuenta: { id: a.id, nombre: a.name, rut: a.rut, url: `/crm/accounts/${a.id}` },
      documentos: docs.map((d) => ({
        id: d.id,
        titulo: d.title,
        modulo: d.module,
        categoria: d.category,
        estado: d.status,
        firma: d.signatureStatus,
        vigenciaDesde: d.effectiveDate,
        vigenciaHasta: d.expirationDate,
        verEnApp: `/opai/documentos/${d.id}`,
        pdfUrl: d.pdfUrl,
      })),
    },
  };
}

function dayBoundsChile(dateStr: string): { gte: Date; lt: Date } {
  // Treat dateStr as a Chile-local date and return a UTC range covering that day.
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  // Chile is UTC-3 (or -4 in summer); use -3 as a safe lower bound. We just want
  // the calendar day, slop is fine for human-facing reports.
  const gte = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const lt = new Date(Date.UTC(y, m - 1, d + 1, 3, 0, 0));
  return { gte, lt };
}

async function toolGetPanicAlerts(tenantId: string, dateStr: string, daysBack: number) {
  const { gte, lt } = dayBoundsChile(dateStr);
  const lower = daysBack > 1 ? new Date(gte.getTime() - (daysBack - 1) * 24 * 60 * 60 * 1000) : gte;
  const rows = await prisma.opsAlertaRonda.findMany({
    where: {
      tenantId,
      tipo: "panico",
      createdAt: { gte: lower, lt },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      severidad: true,
      mensaje: true,
      resuelta: true,
      isAcknowledged: true,
      createdAt: true,
      installation: { select: { id: true, name: true } },
      guardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
    },
  });
  return {
    ok: true,
    data: {
      total: rows.length,
      desde: lower,
      hasta: lt,
      alertas: rows.map((r) => ({
        id: r.id,
        cuando: r.createdAt,
        severidad: r.severidad,
        mensaje: r.mensaje,
        resuelta: r.resuelta,
        reconocida: r.isAcknowledged,
        instalacion: r.installation
          ? { id: r.installation.id, nombre: r.installation.name, url: `/crm/installations/${r.installation.id}` }
          : null,
        guardia: r.guardia
          ? {
              id: r.guardia.id,
              codigo: r.guardia.code,
              nombre: `${r.guardia.persona.firstName} ${r.guardia.persona.lastName}`.trim(),
              rut: r.guardia.persona.rut,
              url: `/personas/guardias/${r.guardia.id}`,
            }
          : null,
      })),
    },
  };
}

async function toolGetDailyAbsences(tenantId: string, dateStr: string) {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const rows = await prisma.opsAsistenciaDiaria.findMany({
    where: {
      tenantId,
      date,
      deletedAt: null,
      attendanceStatus: { in: ["ausente", "no_marcada"] },
    },
    take: 100,
    orderBy: [{ installationId: "asc" }],
    select: {
      id: true,
      attendanceStatus: true,
      plannedShiftStart: true,
      plannedShiftEnd: true,
      installation: { select: { id: true, name: true } },
      puesto: { select: { id: true, name: true } },
      plannedGuardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
    },
  });
  return {
    ok: true,
    data: {
      fecha: dateStr,
      total: rows.length,
      ausencias: rows.map((r) => ({
        id: r.id,
        estado: r.attendanceStatus,
        turnoPlanificado:
          r.plannedShiftStart && r.plannedShiftEnd
            ? `${r.plannedShiftStart}-${r.plannedShiftEnd}`
            : null,
        instalacion: {
          id: r.installation.id,
          nombre: r.installation.name,
          url: `/crm/installations/${r.installation.id}`,
        },
        puesto: { id: r.puesto.id, nombre: r.puesto.name },
        guardia: r.plannedGuardia
          ? {
              id: r.plannedGuardia.id,
              codigo: r.plannedGuardia.code,
              nombre: `${r.plannedGuardia.persona.firstName} ${r.plannedGuardia.persona.lastName}`.trim(),
              rut: r.plannedGuardia.persona.rut,
              url: `/personas/guardias/${r.plannedGuardia.id}`,
            }
          : null,
      })),
    },
  };
}

async function toolGetExtraShifts(tenantId: string, dateStr: string, status?: string) {
  const [y, m, d] = dateStr.split("-").map((n) => parseInt(n, 10));
  const date = new Date(Date.UTC(y, m - 1, d));
  const where: Prisma.OpsTurnoExtraWhereInput = { tenantId, date };
  if (status) where.status = status;
  const rows = await prisma.opsTurnoExtra.findMany({
    where,
    take: 100,
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      tipo: true,
      horasExtra: true,
      amountClp: true,
      installation: { select: { id: true, name: true } },
      guardia: {
        select: {
          id: true,
          code: true,
          persona: { select: { firstName: true, lastName: true, rut: true } },
        },
      },
    },
  });
  return {
    ok: true,
    data: {
      fecha: dateStr,
      total: rows.length,
      turnosExtra: rows.map((r) => ({
        id: r.id,
        estado: r.status,
        tipo: r.tipo,
        horasExtra: r.horasExtra ? Number(r.horasExtra) : null,
        montoClp: Number(r.amountClp),
        instalacion: {
          id: r.installation.id,
          nombre: r.installation.name,
          url: `/crm/installations/${r.installation.id}`,
        },
        guardia: {
          id: r.guardia.id,
          codigo: r.guardia.code,
          nombre: `${r.guardia.persona.firstName} ${r.guardia.persona.lastName}`.trim(),
          rut: r.guardia.persona.rut,
          url: `/personas/guardias/${r.guardia.id}`,
        },
      })),
    },
  };
}

async function toolSearchQuotes(
  tenantId: string,
  query: string | undefined,
  status: string | undefined,
  limit: number,
) {
  const take = Math.max(1, Math.min(limit || 12, 25));
  const where: Prisma.CpqQuoteWhereInput = { tenantId };
  if (status) where.status = status;
  const q = (query || "").trim();
  if (q) {
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { clientName: { contains: q, mode: "insensitive" } },
    ];
  }
  const rows = await prisma.cpqQuote.findMany({
    where,
    take,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      code: true,
      name: true,
      clientName: true,
      status: true,
      monthlyCost: true,
      currency: true,
      validUntil: true,
      updatedAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    nombre: r.name,
    cliente: r.clientName,
    estado: r.status,
    montoMensual: Number(r.monthlyCost),
    moneda: r.currency,
    validaHasta: r.validUntil,
    actualizada: r.updatedAt,
    url: `/crm/cotizaciones/${r.id}`,
  }));
}

/* ── Helpers para tools de documentos contextuales ── */

/**
 * Extrae texto plano de un documento Tiptap (JSON).
 * Recorre recursivamente buscando nodos `text` y agregando saltos de línea
 * en bloques (paragraph, heading, listItem, etc).
 */
function tiptapToPlainText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;
  let out = "";
  if (typeof n.text === "string") out += n.text;
  if (Array.isArray(n.content)) {
    for (const child of n.content) out += tiptapToPlainText(child);
  }
  const blockTypes = new Set([
    "paragraph",
    "heading",
    "listItem",
    "blockquote",
    "codeBlock",
    "tableRow",
    "horizontalRule",
  ]);
  if (typeof n.type === "string" && blockTypes.has(n.type)) {
    out += "\n";
  }
  return out;
}

/**
 * Mapea entityType largo (DocAssociation: "crm_account", "crm_deal"...)
 * al short form usado por CrmFileLink ("account", "deal"...).
 */
function entityTypeToCrmFileLinkType(entityType: string): string | null {
  switch (entityType) {
    case "crm_account": return "account";
    case "crm_deal": return "deal";
    case "crm_installation": return "installation";
    case "crm_contact": return "contact";
    case "ops_guardia": return "guardia";
    default: return null;
  }
}

/**
 * Lista documentos asociados a una entidad. Hace UNION de tres fuentes:
 *  - DocAssociation → Document (Tiptap, contratos generados)
 *  - CrmFileLink → CrmFile (PDFs/DOCX subidos por usuarios: órdenes, facturas, anexos)
 *  - CpqQuoteAttachment (cuando entityType === "cpq_quote")
 *
 * Cada item incluye un `documentId` con prefijo (`doc:`, `file:`, `att:`) para
 * que `read_document` sepa cómo leer cada uno.
 */
async function toolGetEntityDocuments(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit: number,
) {
  const take = Math.max(1, Math.min(limit || 10, 20));

  // Caso especial: cotización CPQ → solo attachments propios
  if (entityType === "cpq_quote") {
    const atts = await prisma.cpqQuoteAttachment.findMany({
      where: { quoteId: entityId, tenantId },
      take,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        publicUrl: true,
        createdAt: true,
      },
    });
    return atts.map((a) => ({
      documentId: `att:${a.id}`,
      title: a.fileName,
      module: "cpq",
      category: "attachment",
      status: "active",
      mimeType: a.mimeType,
      size: a.size,
      pdfUrl: a.publicUrl ?? null,
      updatedAt: a.createdAt.toISOString(),
      url: a.publicUrl ?? `/crm/cotizaciones/${entityId}`,
      source: "cpq_attachment",
    }));
  }

  const linkType = entityTypeToCrmFileLinkType(entityType);

  const [associations, fileLinks] = await Promise.all([
    prisma.docAssociation.findMany({
      where: { entityType, entityId, document: { tenantId } },
      take,
      orderBy: { document: { updatedAt: "desc" } },
      select: {
        role: true,
        document: {
          select: {
            id: true,
            title: true,
            module: true,
            category: true,
            status: true,
            pdfUrl: true,
            updatedAt: true,
          },
        },
      },
    }),
    linkType
      ? prisma.crmFileLink.findMany({
          where: { entityType: linkType, entityId, tenantId },
          take,
          orderBy: { createdAt: "desc" },
          select: {
            createdAt: true,
            file: {
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                size: true,
                storageKey: true,
              },
            },
          },
        })
      : Promise.resolve([] as Array<{ createdAt: Date; file: { id: string; fileName: string; mimeType: string; size: number; storageKey: string } }>),
  ]);

  const docItems = associations.map((a) => ({
    documentId: `doc:${a.document.id}`,
    title: a.document.title,
    module: a.document.module,
    category: a.document.category,
    status: a.document.status,
    role: a.role,
    pdfUrl: a.document.pdfUrl ?? null,
    updatedAt: a.document.updatedAt.toISOString(),
    url: `/docs/${a.document.id}`,
    source: "doc",
  }));

  const fileItems = fileLinks.map((l) => ({
    documentId: `file:${l.file.id}`,
    title: l.file.fileName,
    module: "crm",
    category: "attachment",
    status: "active",
    mimeType: l.file.mimeType,
    size: l.file.size,
    pdfUrl: null,
    updatedAt: l.createdAt.toISOString(),
    url: `/api/crm/files/${l.file.id}/download`,
    source: "crm_file",
  }));

  // Mezcla y ordena por fecha desc, recorta a `take`
  return [...docItems, ...fileItems]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, take);
}

/**
 * Lee el contenido textual de un documento. El `documentId` puede venir con
 * prefijo (`doc:xxx`, `file:xxx`, `att:xxx`) — formato producido por
 * `toolGetEntityDocuments`. Si no trae prefijo, asume `doc:` por compatibilidad.
 */
async function toolReadDocument(tenantId: string, rawDocumentId: string) {
  const id = rawDocumentId.trim();
  if (!id) return { ok: false, error: "documentId requerido." };

  const colon = id.indexOf(":");
  const prefix = colon > 0 ? id.slice(0, colon) : "doc";
  const realId = colon > 0 ? id.slice(colon + 1) : id;

  if (prefix === "doc") {
    const doc = await prisma.document.findFirst({
      where: { id: realId, tenantId },
      select: {
        id: true,
        title: true,
        module: true,
        category: true,
        status: true,
        content: true,
        pdfUrl: true,
        updatedAt: true,
      },
    });
    if (!doc) return { ok: false, error: "Documento no encontrado o sin permiso." };
    const fullText = tiptapToPlainText(doc.content)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const MAX = 12_000;
    const truncated = fullText.length > MAX;
    return {
      ok: true,
      data: {
        id: `doc:${doc.id}`,
        title: doc.title,
        module: doc.module,
        category: doc.category,
        status: doc.status,
        pdfUrl: doc.pdfUrl ?? null,
        updatedAt: doc.updatedAt.toISOString(),
        url: `/docs/${doc.id}`,
        text: truncated ? `${fullText.slice(0, MAX)}\n\n[...documento truncado a ${MAX} caracteres]` : fullText,
        truncated,
        length: fullText.length,
        source: "doc",
      },
    };
  }

  if (prefix === "file") {
    const file = await prisma.crmFile.findFirst({
      where: { id: realId, tenantId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        storageKey: true,
        createdAt: true,
      },
    });
    if (!file) return { ok: false, error: "Archivo no encontrado o sin permiso." };
    return await readBinaryFile({
      idLabel: `file:${file.id}`,
      title: file.fileName,
      mimeType: file.mimeType,
      storageKey: file.storageKey,
      updatedAt: file.createdAt,
      url: `/api/crm/files/${file.id}/download`,
      module: "crm",
    });
  }

  if (prefix === "att") {
    const att = await prisma.cpqQuoteAttachment.findFirst({
      where: { id: realId, tenantId },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        storageKey: true,
        publicUrl: true,
        createdAt: true,
      },
    });
    if (!att) return { ok: false, error: "Adjunto no encontrado o sin permiso." };
    return await readBinaryFile({
      idLabel: `att:${att.id}`,
      title: att.fileName,
      mimeType: att.mimeType,
      storageKey: att.storageKey,
      updatedAt: att.createdAt,
      url: att.publicUrl ?? `#`,
      module: "cpq",
    });
  }

  return { ok: false, error: `Prefijo de documentId desconocido: '${prefix}'.` };
}

/**
 * Lee un binario de R2 y extrae texto. Soporta PDF, DOCX, TXT, MD vía
 * `extractText`. Capa tamaño y trunca el texto resultante.
 */
async function readBinaryFile(opts: {
  idLabel: string;
  title: string;
  mimeType: string;
  storageKey: string;
  updatedAt: Date;
  url: string;
  module: string;
}) {
  try {
    const buffer = await getFileBuffer(opts.storageKey);
    let text: string;
    try {
      text = await extractText(buffer, opts.mimeType);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "no soportado";
      return {
        ok: false,
        error: `No fue posible extraer texto del archivo (${opts.mimeType}): ${msg}. Sugerencia: descárgalo desde la app.`,
      };
    }
    const fullText = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const MAX = 12_000;
    const truncated = fullText.length > MAX;
    return {
      ok: true,
      data: {
        id: opts.idLabel,
        title: opts.title,
        module: opts.module,
        category: "attachment",
        status: "active",
        mimeType: opts.mimeType,
        pdfUrl: null,
        updatedAt: opts.updatedAt.toISOString(),
        url: opts.url,
        text: truncated ? `${fullText.slice(0, MAX)}\n\n[...documento truncado a ${MAX} caracteres]` : fullText,
        truncated,
        length: fullText.length,
        source: opts.idLabel.startsWith("att:") ? "cpq_attachment" : "crm_file",
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error leyendo archivo";
    return { ok: false, error: msg };
  }
}

async function logAiAction(opts: {
  tenantId: string;
  userId: string;
  toolName: string;
  args: unknown;
  status: "success" | "denied" | "validation_error" | "internal_error";
  resultEntityId?: string;
  resultEntityType?: string;
  errorMessage?: string;
  startedAt: number;
}) {
  try {
    await prisma.aiActionLog.create({
      data: {
        tenantId: opts.tenantId,
        userId: opts.userId,
        toolName: opts.toolName,
        args: opts.args as Prisma.InputJsonValue,
        status: opts.status,
        resultEntityId: opts.resultEntityId ?? null,
        resultEntityType: opts.resultEntityType ?? null,
        errorMessage: opts.errorMessage ?? null,
        durationMs: Date.now() - opts.startedAt,
      },
    });
  } catch (e) {
    console.warn("[AiActionLog] Failed to write log:", e);
  }
}

async function toolCreateLead(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "leads")) {
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "denied", errorMessage: "Sin permiso crm.leads.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear leads en este tenant. Contacta a tu administrador." };
  }
  const parsed = createLeadSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;
  const hasAnyKey = body.companyName || (body.firstName && body.lastName) || body.email || body.phone;
  if (!hasAnyKey) {
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "validation_error", errorMessage: "Sin campos identificatorios", startedAt: t0 });
    return { ok: false, error: "Faltan datos identificatorios. Necesito al menos uno: empresa, nombre+apellido, email o teléfono." };
  }
  try {
    const firstName = toSentenceCase(body.firstName ?? undefined);
    const lastName = toSentenceCase(body.lastName ?? undefined);
    const lead = await prisma.crmLead.create({
      data: {
        tenantId,
        status: "pending",
        source: body.source || null,
        firstName,
        lastName,
        email: body.email || null,
        phone: body.phone || null,
        companyName: body.companyName || null,
        notes: body.notes || null,
        industry: body.industry || null,
        address: body.address || null,
        commune: body.commune || null,
        city: body.city || null,
        website: body.website || null,
        serviceType: body.serviceType || null,
      },
    });
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "success", resultEntityId: lead.id, resultEntityType: "crm_lead", startedAt: t0 });
    const displayName =
      [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim() ||
      lead.companyName ||
      lead.email ||
      lead.phone ||
      "Lead sin nombre";
    return {
      ok: true,
      data: {
        id: lead.id,
        entityType: "crm_lead",
        name: displayName,
        url: `/crm/leads/${lead.id}`,
        companyName: lead.companyName,
        email: lead.email,
        phone: lead.phone,
        status: lead.status,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_lead", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear el lead: ${msg}` };
  }
}

async function toolCreateAccount(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "accounts")) {
    await logAiAction({ tenantId, userId, toolName: "create_account", args, status: "denied", errorMessage: "Sin permiso crm.accounts.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear cuentas." };
  }
  const parsed = createAccountSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_account", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;
  try {
    const account = await prisma.crmAccount.create({
      data: {
        tenantId,
        name: body.name,
        type: body.type,
        rut: body.rut || null,
        legalName: body.legalName || null,
        legalRepresentativeName: body.legalRepresentativeName || null,
        legalRepresentativeRut: body.legalRepresentativeRut || null,
        industry: body.industry || null,
        segment: body.segment || null,
        status: body.status,
        isActive: body.isActive,
        website: body.website || null,
        address: body.address || null,
        commune: body.commune || null,
        notaryName: body.notaryName || null,
        notaryDate: body.notaryDate || null,
        notes: body.notes || null,
      },
    });
    await logAiAction({ tenantId, userId, toolName: "create_account", args, status: "success", resultEntityId: account.id, resultEntityType: "crm_account", startedAt: t0 });
    return {
      ok: true,
      data: {
        id: account.id,
        entityType: "crm_account",
        name: account.name,
        url: `/crm/accounts/${account.id}`,
        type: account.type,
        rut: account.rut,
        industry: account.industry,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_account", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear la cuenta: ${msg}` };
  }
}

async function toolCreateContact(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "contacts")) {
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "denied", errorMessage: "Sin permiso crm.contacts.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear contactos." };
  }
  const parsed = createContactSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;
  const account = await prisma.crmAccount.findFirst({
    where: { id: body.accountId, tenantId },
    select: { id: true, name: true },
  });
  if (!account) {
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "validation_error", errorMessage: "Cuenta no encontrada o no pertenece al tenant", startedAt: t0 });
    return { ok: false, error: "La cuenta indicada no existe o no pertenece a tu organización." };
  }
  try {
    const contact = await prisma.crmContact.create({
      data: {
        tenantId,
        accountId: body.accountId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone || null,
        roleTitle: body.roleTitle || null,
        isPrimary: body.isPrimary,
      },
    });
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "success", resultEntityId: contact.id, resultEntityType: "crm_contact", startedAt: t0 });
    const displayName = `${contact.firstName} ${contact.lastName}`.trim();
    return {
      ok: true,
      data: {
        id: contact.id,
        entityType: "crm_contact",
        name: displayName,
        url: `/crm/contacts/${contact.id}`,
        email: contact.email,
        phone: contact.phone,
        roleTitle: contact.roleTitle,
        accountId: contact.accountId,
        accountName: account.name,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_contact", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear el contacto: ${msg}` };
  }
}

async function toolCreateDeal(
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  args: Record<string, unknown>,
): Promise<unknown> {
  const t0 = Date.now();
  if (!canEdit(perms, "crm", "deals")) {
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "denied", errorMessage: "Sin permiso crm.deals.edit", startedAt: t0 });
    return { ok: false, error: "No tienes permiso para crear deals." };
  }
  const parsed = createDealSchema.safeParse(args);
  if (!parsed.success) {
    const msg = parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `Datos inválidos: ${msg}` };
  }
  const body = parsed.data;
  const account = await prisma.crmAccount.findFirst({
    where: { id: body.accountId, tenantId },
    select: { id: true, name: true },
  });
  if (!account) {
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: "Cuenta no encontrada", startedAt: t0 });
    return { ok: false, error: "La cuenta indicada no existe o no pertenece a tu organización." };
  }
  try {
    let stageId = body.stageId;
    if (!stageId) {
      const firstStage = await prisma.crmPipelineStage.findFirst({
        where: { tenantId, isActive: true },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      if (!firstStage) {
        await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "validation_error", errorMessage: "No hay pipeline configurado", startedAt: t0 });
        return { ok: false, error: "No hay etapas de pipeline configuradas. Configura el pipeline antes de crear deals." };
      }
      stageId = firstStage.id;
    }
    const deal = await prisma.crmDeal.create({
      data: {
        tenantId,
        accountId: body.accountId,
        title: body.title || `Deal — ${account.name}`,
        stageId,
        primaryContactId: body.primaryContactId || null,
        amount: body.amount,
        probability: body.probability,
        expectedCloseDate: body.expectedCloseDate ? new Date(body.expectedCloseDate) : null,
        proposalLink: body.proposalLink || null,
      },
    });
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "success", resultEntityId: deal.id, resultEntityType: "crm_deal", startedAt: t0 });
    return {
      ok: true,
      data: {
        id: deal.id,
        entityType: "crm_deal",
        name: deal.title,
        url: `/crm/deals/${deal.id}`,
        amount: Number(deal.amount),
        probability: deal.probability,
        accountId: deal.accountId,
        accountName: account.name,
      },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error desconocido";
    await logAiAction({ tenantId, userId, toolName: "create_deal", args, status: "internal_error", errorMessage: msg, startedAt: t0 });
    return { ok: false, error: `No se pudo crear el deal: ${msg}` };
  }
}

export async function executeToolCallV2(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string,
  userId: string,
  perms: RolePermissions,
  canViewAllRendiciones: boolean,
): Promise<unknown> {
  const legacy = await executeLegacyTool(toolName, args, tenantId, userId, canViewAllRendiciones);
  if (legacy !== null) return legacy;

  if (toolName === "create_lead") return await toolCreateLead(tenantId, userId, perms, args);
  if (toolName === "create_account") return await toolCreateAccount(tenantId, userId, perms, args);
  if (toolName === "create_contact") return await toolCreateContact(tenantId, userId, perms, args);
  if (toolName === "create_deal") return await toolCreateDeal(tenantId, userId, perms, args);

  try {
    switch (toolName) {
      case "search_accounts":
        return {
          ok: true,
          data: await toolSearchAccounts(
            tenantId,
            typeof args.query === "string" ? args.query : "",
            typeof args.limit === "number" ? args.limit : 10,
          ),
        };
      case "search_deals":
        return {
          ok: true,
          data: await toolSearchDeals(
            tenantId,
            typeof args.query === "string" ? args.query : undefined,
            typeof args.status === "string" ? args.status : undefined,
            typeof args.limit === "number" ? args.limit : 12,
          ),
        };
      case "get_deal_pipeline":
        return { ok: true, data: await toolGetDealPipeline(tenantId) };
      case "search_installations":
        return {
          ok: true,
          data: await toolSearchInstallations(
            tenantId,
            typeof args.query === "string" ? args.query : "",
            typeof args.limit === "number" ? args.limit : 10,
          ),
        };
      case "get_daily_attendance": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        return { ok: true, data: await toolGetDailyAttendance(tenantId, dateStr) };
      }
      case "get_supervision_visits": {
        const w = typeof args.weeks_back === "number" ? args.weeks_back : 3;
        return { ok: true, data: await toolGetSupervisionVisits(tenantId, w) };
      }
      case "get_rondas_status": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        return { ok: true, data: await toolGetRondasStatus(tenantId, dateStr) };
      }
      case "get_tickets_summary":
        return { ok: true, data: await toolGetTicketsSummary(tenantId) };
      case "get_finance_summary": {
        const days = typeof args.days_back === "number" ? args.days_back : 30;
        return { ok: true, data: await toolGetFinanceSummary(tenantId, days) };
      }
      case "get_user_context":
        return await toolGetUserContext(tenantId, userId);
      case "get_tenant_summary":
        return { ok: true, data: await toolGetTenantSummary(tenantId) };
      case "get_guardia_detail":
        return await toolGetGuardiaDetail(
          tenantId,
          typeof args.query === "string" ? args.query : "",
        );
      case "list_guardia_documents":
        return await toolListGuardiaDocuments(
          tenantId,
          typeof args.query === "string" ? args.query : "",
          typeof args.type === "string" ? args.type : undefined,
        );
      case "get_account_detail":
        return await toolGetAccountDetail(
          tenantId,
          typeof args.query === "string" ? args.query : "",
        );
      case "list_account_documents":
        return await toolListAccountDocuments(
          tenantId,
          typeof args.query === "string" ? args.query : "",
          typeof args.category === "string" ? args.category : undefined,
        );
      case "get_panic_alerts": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        const daysBack = typeof args.days_back === "number" ? args.days_back : 1;
        return await toolGetPanicAlerts(tenantId, dateStr, daysBack);
      }
      case "get_daily_absences": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        return await toolGetDailyAbsences(tenantId, dateStr);
      }
      case "get_extra_shifts": {
        const dateStr =
          typeof args.date === "string" && args.date.length >= 8 ? args.date : todayChileStr();
        const status = typeof args.status === "string" ? args.status : undefined;
        return await toolGetExtraShifts(tenantId, dateStr, status);
      }
      case "search_contacts":
        return {
          ok: true,
          data: await toolSearchContacts(
            tenantId,
            typeof args.query === "string" ? args.query : "",
            typeof args.limit === "number" ? args.limit : 10,
          ),
        };
      case "search_all":
        return {
          ok: true,
          data: await toolSearchAll(
            tenantId,
            typeof args.query === "string" ? args.query : "",
            typeof args.limit === "number" ? args.limit : 5,
          ),
        };
      case "search_quotes":
        return {
          ok: true,
          data: await toolSearchQuotes(
            tenantId,
            typeof args.query === "string" ? args.query : undefined,
            typeof args.status === "string" ? args.status : undefined,
            typeof args.limit === "number" ? args.limit : 12,
          ),
        };
      case "get_entity_documents":
        return {
          ok: true,
          data: await toolGetEntityDocuments(
            tenantId,
            typeof args.entityType === "string" ? args.entityType : "",
            typeof args.entityId === "string" ? args.entityId : "",
            typeof args.limit === "number" ? args.limit : 10,
          ),
        };
      case "read_document":
        return await toolReadDocument(
          tenantId,
          typeof args.documentId === "string" ? args.documentId : "",
        );
      default:
        return { ok: false, error: "Herramienta no soportada" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al ejecutar herramienta";
    return { ok: false, error: msg };
  }
}
