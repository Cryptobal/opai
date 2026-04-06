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
        description: "Lista negocios (deals) del CRM con cuenta, etapa, monto y fechas.",
        parameters: {
          type: "object",
          properties: {
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
  ];
}

export function getToolDefinitionsV2(allowDataQuestions: boolean) {
  if (!allowDataQuestions) return [];
  return [...baseToolDefinitions(), ...v2ToolDefinitions()];
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
  }));
}

async function toolSearchDeals(tenantId: string, status: string | undefined, limit: number) {
  const take = Math.max(1, Math.min(limit || 12, 25));
  const where: Prisma.CrmDealWhereInput = { tenantId };
  if (status) where.status = status;
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
  }));
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

export async function executeToolCallV2(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string,
  userId: string,
  canViewAllRendiciones: boolean,
): Promise<unknown> {
  const legacy = await executeLegacyTool(toolName, args, tenantId, userId, canViewAllRendiciones);
  if (legacy !== null) return legacy;

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
      default:
        return { ok: false, error: "Herramienta no soportada" };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error al ejecutar herramienta";
    return { ok: false, error: msg };
  }
}
