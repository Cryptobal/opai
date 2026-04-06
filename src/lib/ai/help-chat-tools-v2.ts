import { prisma } from "@/lib/prisma"
import { todayChileStr } from "@/lib/fx-date"

/* ── Re-export existing tools ── */
export {
  searchGuardiasByNameOrRut,
  getGuardiasMetrics,
  getUfUtmIndicators,
  getPendingRendicionesForApproval,
} from "@/lib/ai/help-chat-tools"

/* ══════════════════════════════════════════════════════════════
   CRM tools
   ══════════════════════════════════════════════════════════════ */

export async function searchAccounts(
  tenantId: string,
  query: string,
  filters?: { type?: string; status?: string },
) {
  const clean = query.trim()
  if (!clean) return []

  const where: Record<string, unknown> = {
    tenantId,
    OR: [
      { name: { contains: clean, mode: "insensitive" } },
      { rut: { contains: clean, mode: "insensitive" } },
    ],
  }
  if (filters?.type) where.type = filters.type
  if (filters?.status) where.status = filters.status

  const rows = await prisma.crmAccount.findMany({
    where,
    select: {
      id: true,
      name: true,
      rut: true,
      type: true,
      status: true,
      industry: true,
      _count: { select: { installations: true, deals: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10,
  })

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    rut: r.rut,
    type: r.type,
    status: r.status,
    industry: r.industry,
    installations: r._count.installations,
    deals: r._count.deals,
  }))
}

export async function searchDeals(
  tenantId: string,
  filters?: { status?: string; daysBack?: number },
) {
  const where: Record<string, unknown> = { tenantId }
  if (filters?.status) where.status = filters.status
  if (filters?.daysBack) {
    const since = new Date()
    since.setDate(since.getDate() - filters.daysBack)
    where.createdAt = { gte: since }
  }

  const rows = await prisma.crmDeal.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      amount: true,
      expectedCloseDate: true,
      createdAt: true,
      account: { select: { name: true } },
      stage: { select: { name: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 15,
  })

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    amount: Number(r.amount),
    expectedCloseDate: r.expectedCloseDate?.toISOString().slice(0, 10) ?? null,
    createdAt: r.createdAt.toISOString().slice(0, 10),
    accountName: r.account.name,
    stageName: r.stage.name,
  }))
}

export async function getDealPipeline(tenantId: string) {
  const stages = await prisma.crmPipelineStage.findMany({
    where: { tenantId, isActive: true },
    select: {
      id: true,
      name: true,
      order: true,
      isClosedWon: true,
      isClosedLost: true,
      _count: { select: { deals: { where: { tenantId } } } },
    },
    orderBy: [{ order: "asc" }],
  })

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [wonRecent, lostRecent] = await Promise.all([
    prisma.crmDeal.count({
      where: {
        tenantId,
        status: "won",
        updatedAt: { gte: thirtyDaysAgo },
      },
    }),
    prisma.crmDeal.count({
      where: {
        tenantId,
        status: "lost",
        updatedAt: { gte: thirtyDaysAgo },
      },
    }),
  ])

  return {
    stages: stages.map((s) => ({
      name: s.name,
      order: s.order,
      isClosedWon: s.isClosedWon,
      isClosedLost: s.isClosedLost,
      dealsCount: s._count.deals,
    })),
    last30Days: { won: wonRecent, lost: lostRecent },
  }
}

export async function searchInstallations(
  tenantId: string,
  query: string,
  filters?: { status?: string },
) {
  const clean = query.trim()
  const where: Record<string, unknown> = { tenantId }
  if (clean) {
    where.OR = [
      { name: { contains: clean, mode: "insensitive" } },
      { address: { contains: clean, mode: "insensitive" } },
    ]
  }
  if (filters?.status) where.status = filters.status

  const rows = await prisma.crmInstallation.findMany({
    where,
    select: {
      id: true,
      name: true,
      address: true,
      status: true,
      account: { select: { name: true } },
      supervisorAssignments: {
        where: { isActive: true },
        select: { supervisor: { select: { name: true } } },
        take: 1,
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 10,
  })

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    status: r.status,
    accountName: r.account?.name ?? null,
    supervisor: r.supervisorAssignments[0]?.supervisor.name ?? null,
  }))
}

/* ══════════════════════════════════════════════════════════════
   Ops tools
   ══════════════════════════════════════════════════════════════ */

export async function getDailyAttendance(tenantId: string, date?: string) {
  const targetDate = date ? new Date(`${date}T00:00:00Z`) : new Date(`${todayChileStr()}T00:00:00Z`)

  const rows = await prisma.opsAsistenciaDiaria.findMany({
    where: { tenantId, date: targetDate, deletedAt: null },
    select: {
      attendanceStatus: true,
      teGenerated: true,
      installation: { select: { name: true } },
    },
  })

  const byInstallation: Record<string, { total: number; presente: number; ausente: number; pendiente: number; te: number }> = {}
  let totalPresente = 0
  let totalAusente = 0
  let totalPendiente = 0
  let totalTe = 0

  for (const r of rows) {
    const inst = r.installation.name
    if (!byInstallation[inst]) {
      byInstallation[inst] = { total: 0, presente: 0, ausente: 0, pendiente: 0, te: 0 }
    }
    byInstallation[inst].total++

    if (r.attendanceStatus === "presente") { byInstallation[inst].presente++; totalPresente++ }
    else if (r.attendanceStatus === "ausente") { byInstallation[inst].ausente++; totalAusente++ }
    else { byInstallation[inst].pendiente++; totalPendiente++ }

    if (r.teGenerated) { byInstallation[inst].te++; totalTe++ }
  }

  // PPC count for the date
  const ppc = await prisma.opsPpcSnapshot.findFirst({
    where: { tenantId, date: targetDate },
    select: { totalPpc: true, totalGuards: true, ppcPercentage: true },
  })

  return {
    date: targetDate.toISOString().slice(0, 10),
    total: rows.length,
    presente: totalPresente,
    ausente: totalAusente,
    pendiente: totalPendiente,
    turnosExtra: totalTe,
    ppc: ppc ? { total: ppc.totalPpc, guards: ppc.totalGuards, percentage: ppc.ppcPercentage } : null,
    byInstallation,
  }
}

export async function getSupervisionVisits(tenantId: string, weeksBack = 3) {
  const since = new Date()
  since.setDate(since.getDate() - weeksBack * 7)

  const rows = await prisma.opsVisitaSupervision.findMany({
    where: { tenantId, checkInAt: { gte: since } },
    select: {
      id: true,
      status: true,
      checkInAt: true,
      supervisor: { select: { name: true } },
      installation: { select: { name: true } },
    },
    orderBy: [{ checkInAt: "desc" }],
    take: 50,
  })

  const bySupervisor: Record<string, number> = {}
  const byWeek: Record<string, number> = {}

  for (const r of rows) {
    bySupervisor[r.supervisor.name] = (bySupervisor[r.supervisor.name] ?? 0) + 1
    const weekStart = new Date(r.checkInAt)
    weekStart.setDate(weekStart.getDate() - weekStart.getDay())
    const weekKey = weekStart.toISOString().slice(0, 10)
    byWeek[weekKey] = (byWeek[weekKey] ?? 0) + 1
  }

  return {
    total: rows.length,
    weeksBack,
    bySupervisor,
    byWeek,
    recent: rows.slice(0, 10).map((r) => ({
      supervisor: r.supervisor.name,
      installation: r.installation.name,
      date: r.checkInAt.toISOString().slice(0, 10),
      status: r.status,
    })),
  }
}

export async function getRondasStatus(tenantId: string, date?: string) {
  const targetDate = date ?? todayChileStr()
  const dayStart = new Date(`${targetDate}T00:00:00Z`)
  const dayEnd = new Date(`${targetDate}T23:59:59Z`)

  const [ejecuciones, programacionesActivas, alertasPendientes] = await Promise.all([
    prisma.opsRondaEjecucion.groupBy({
      by: ["status"],
      where: { tenantId, scheduledAt: { gte: dayStart, lte: dayEnd } },
      _count: true,
    }),
    prisma.opsRondaProgramacion.count({
      where: { rondaTemplate: { tenantId }, isActive: true },
    }),
    prisma.opsAlertaRonda.count({
      where: { tenantId, resuelta: false, createdAt: { gte: dayStart } },
    }),
  ])

  const statusCounts: Record<string, number> = {}
  let totalEjecuciones = 0
  for (const e of ejecuciones) {
    statusCounts[e.status] = e._count
    totalEjecuciones += e._count
  }

  return {
    date: targetDate,
    programacionesActivas,
    totalEjecuciones,
    byStatus: statusCounts,
    alertasPendientes,
  }
}

export async function getTicketsSummary(tenantId: string, limit = 10) {
  const [byStatus, slaBreached, recent] = await Promise.all([
    prisma.opsTicket.groupBy({
      by: ["status"],
      where: { tenantId },
      _count: true,
    }),
    prisma.opsTicket.count({
      where: { tenantId, slaBreached: true, status: { notIn: ["closed", "resolved"] } },
    }),
    prisma.opsTicket.findMany({
      where: { tenantId },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        priority: true,
        slaBreached: true,
        slaDueAt: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take: Math.min(limit, 20),
    }),
  ])

  const statusMap: Record<string, number> = {}
  let total = 0
  for (const s of byStatus) {
    statusMap[s.status] = s._count
    total += s._count
  }

  return {
    total,
    byStatus: statusMap,
    slaBreachedOpen: slaBreached,
    recent: recent.map((t) => ({
      id: t.id,
      code: t.code,
      title: t.title,
      status: t.status,
      priority: t.priority,
      slaBreached: t.slaBreached,
      slaDueAt: t.slaDueAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString().slice(0, 10),
    })),
  }
}

/* ══════════════════════════════════════════════════════════════
   Finance tools
   ══════════════════════════════════════════════════════════════ */

export async function getFinanceSummary(tenantId: string, daysBack = 30) {
  const since = new Date()
  since.setDate(since.getDate() - daysBack)

  const [rendByStatus, dteByStatus] = await Promise.all([
    prisma.financeRendicion.groupBy({
      by: ["status"],
      where: { tenantId, createdAt: { gte: since } },
      _count: true,
      _sum: { amount: true },
    }),
    prisma.financeDte.groupBy({
      by: ["siiStatus"],
      where: { tenantId, createdAt: { gte: since } },
      _count: true,
      _sum: { totalAmount: true },
    }),
  ])

  return {
    daysBack,
    rendiciones: rendByStatus.map((r) => ({
      status: r.status,
      count: r._count,
      totalAmount: Number(r._sum.amount ?? 0),
    })),
    dtes: dteByStatus.map((d) => ({
      status: d.siiStatus,
      count: d._count,
      totalAmount: Number(d._sum.totalAmount ?? 0),
    })),
  }
}

/* ══════════════════════════════════════════════════════════════
   System tools
   ══════════════════════════════════════════════════════════════ */

export async function getUserContext(tenantId: string, userId: string) {
  const admin = await prisma.admin.findFirst({
    where: { id: userId, tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      roleTemplate: { select: { name: true, permissions: true } },
    },
  })
  if (!admin) return null

  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role,
    roleName: admin.roleTemplate?.name ?? null,
  }
}

export async function getTenantSummary(tenantId: string) {
  const [users, clients, installations, guardias, deals, tickets] = await Promise.all([
    prisma.admin.count({ where: { tenantId, status: "active" } }),
    prisma.crmAccount.count({ where: { tenantId, status: "client_active" } }),
    prisma.crmInstallation.count({ where: { tenantId, status: "active" } }),
    prisma.opsGuardia.count({ where: { tenantId, lifecycleStatus: "contratado" } }),
    prisma.crmDeal.count({ where: { tenantId, status: "open" } }),
    prisma.opsTicket.count({ where: { tenantId, status: { notIn: ["closed", "resolved"] } } }),
  ])

  return { users, clients, installations, guardias, dealsOpen: deals, ticketsOpen: tickets }
}

/* ══════════════════════════════════════════════════════════════
   Tool definitions for OpenAI function calling
   ══════════════════════════════════════════════════════════════ */

export function getToolDefinitionsV2(allowDataQuestions: boolean) {
  if (!allowDataQuestions) return []

  return [
    /* ── Existing tools ── */
    {
      type: "function" as const,
      function: {
        name: "search_guardias",
        description: "Busca guardias por nombre, apellido, RUT o código.",
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
        description: "Obtiene rendiciones pendientes por aprobar.",
        parameters: {
          type: "object",
          properties: {
            scope: { type: "string", enum: ["mine", "all"], description: "mine: solo las mías; all: todas las pendientes." },
            limit: { type: "number", description: "Cantidad máxima de resultados (1-20)." },
          },
          additionalProperties: false,
        },
      },
    },
    /* ── CRM tools ── */
    {
      type: "function" as const,
      function: {
        name: "search_accounts",
        description: "Busca cuentas/clientes por nombre o RUT. Filtra por tipo (prospect/client) y estado.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda (nombre o RUT)." },
            type: { type: "string", enum: ["prospect", "client"], description: "Tipo de cuenta." },
            status: { type: "string", description: "Estado de la cuenta (prospect, client_active, client_inactive)." },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_deals",
        description: "Busca oportunidades comerciales (deals). Filtra por estado y rango de días.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["open", "won", "lost"], description: "Estado del deal." },
            days_back: { type: "number", description: "Buscar deals creados en los últimos N días." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_deal_pipeline",
        description: "Obtiene el pipeline comercial: deals agrupados por etapa, y ganados/perdidos últimos 30 días.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "search_installations",
        description: "Busca instalaciones por nombre o dirección. Incluye supervisor asignado.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Texto de búsqueda (nombre o dirección)." },
            status: { type: "string", enum: ["prospect", "active", "inactive"], description: "Estado." },
          },
          required: ["query"],
        },
      },
    },
    /* ── Ops tools ── */
    {
      type: "function" as const,
      function: {
        name: "get_daily_attendance",
        description: "Obtiene asistencia diaria: presentes, ausentes, pendientes, PPC y turnos extra por instalación.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Fecha en formato YYYY-MM-DD. Si no se indica, usa hoy." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_supervision_visits",
        description: "Obtiene visitas de supervisión agrupadas por supervisor y por semana.",
        parameters: {
          type: "object",
          properties: {
            weeks_back: { type: "number", description: "Cantidad de semanas hacia atrás (default 3)." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_rondas_status",
        description: "Obtiene estado de rondas del día: ejecuciones por estado, programaciones activas, alertas pendientes.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Fecha en formato YYYY-MM-DD. Si no se indica, usa hoy." },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "get_tickets_summary",
        description: "Obtiene resumen de tickets: conteo por estado, SLA vencido, tickets recientes.",
        parameters: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Cantidad de tickets recientes a listar (default 10)." },
          },
          additionalProperties: false,
        },
      },
    },
    /* ── Finance tools ── */
    {
      type: "function" as const,
      function: {
        name: "get_finance_summary",
        description: "Obtiene resumen financiero: rendiciones y DTEs por estado/monto de los últimos N días.",
        parameters: {
          type: "object",
          properties: {
            days_back: { type: "number", description: "Rango de días hacia atrás (default 30)." },
          },
          additionalProperties: false,
        },
      },
    },
    /* ── System tools ── */
    {
      type: "function" as const,
      function: {
        name: "get_tenant_summary",
        description: "Obtiene KPIs globales del tenant: usuarios, clientes, instalaciones, guardias, deals y tickets.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
  ]
}

/* ══════════════════════════════════════════════════════════════
   Tool executor
   ══════════════════════════════════════════════════════════════ */

export async function executeToolCallV2(
  toolName: string,
  args: Record<string, unknown>,
  tenantId: string,
  userId: string,
  canViewAllRendiciones: boolean,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    switch (toolName) {
      /* ── Existing tools (dynamic import to avoid duplication) ── */
      case "search_guardias": {
        const { searchGuardiasByNameOrRut } = await import("@/lib/ai/help-chat-tools")
        const query = typeof args.query === "string" ? args.query : ""
        const limit = typeof args.limit === "number" ? args.limit : 8
        return { ok: true, data: await searchGuardiasByNameOrRut(tenantId, query, limit) }
      }
      case "get_guardias_metrics": {
        const { getGuardiasMetrics } = await import("@/lib/ai/help-chat-tools")
        return { ok: true, data: await getGuardiasMetrics(tenantId) }
      }
      case "get_uf_utm": {
        const { getUfUtmIndicators } = await import("@/lib/ai/help-chat-tools")
        return { ok: true, data: await getUfUtmIndicators() }
      }
      case "get_pending_rendiciones": {
        const { getPendingRendicionesForApproval } = await import("@/lib/ai/help-chat-tools")
        const scope = args.scope === "all" && canViewAllRendiciones ? "all" : "mine"
        const limit = typeof args.limit === "number" ? args.limit : 8
        return {
          ok: true,
          data: await getPendingRendicionesForApproval({ tenantId, userId, includeAll: scope === "all", limit }),
        }
      }

      /* ── CRM ── */
      case "search_accounts": {
        const query = typeof args.query === "string" ? args.query : ""
        const filters: { type?: string; status?: string } = {}
        if (typeof args.type === "string") filters.type = args.type
        if (typeof args.status === "string") filters.status = args.status
        return { ok: true, data: await searchAccounts(tenantId, query, filters) }
      }
      case "search_deals": {
        const filters: { status?: string; daysBack?: number } = {}
        if (typeof args.status === "string") filters.status = args.status
        if (typeof args.days_back === "number") filters.daysBack = args.days_back
        return { ok: true, data: await searchDeals(tenantId, filters) }
      }
      case "get_deal_pipeline": {
        return { ok: true, data: await getDealPipeline(tenantId) }
      }
      case "search_installations": {
        const query = typeof args.query === "string" ? args.query : ""
        const filters: { status?: string } = {}
        if (typeof args.status === "string") filters.status = args.status
        return { ok: true, data: await searchInstallations(tenantId, query, filters) }
      }

      /* ── Ops ── */
      case "get_daily_attendance": {
        const date = typeof args.date === "string" ? args.date : undefined
        return { ok: true, data: await getDailyAttendance(tenantId, date) }
      }
      case "get_supervision_visits": {
        const weeksBack = typeof args.weeks_back === "number" ? args.weeks_back : 3
        return { ok: true, data: await getSupervisionVisits(tenantId, weeksBack) }
      }
      case "get_rondas_status": {
        const date = typeof args.date === "string" ? args.date : undefined
        return { ok: true, data: await getRondasStatus(tenantId, date) }
      }
      case "get_tickets_summary": {
        const limit = typeof args.limit === "number" ? args.limit : 10
        return { ok: true, data: await getTicketsSummary(tenantId, limit) }
      }

      /* ── Finance ── */
      case "get_finance_summary": {
        const daysBack = typeof args.days_back === "number" ? args.days_back : 30
        return { ok: true, data: await getFinanceSummary(tenantId, daysBack) }
      }

      /* ── System ── */
      case "get_tenant_summary": {
        return { ok: true, data: await getTenantSummary(tenantId) }
      }

      default:
        return { ok: false, error: "Herramienta no soportada" }
    }
  } catch (err) {
    console.error(`Tool call error [${toolName}]:`, err)
    return { ok: false, error: `No fue posible ejecutar ${toolName} en este momento.` }
  }
}
