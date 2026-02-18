import { prisma } from "@/lib/prisma";
import { todayChileStr } from "@/lib/fx-date";

export type GuardiasSearchResult = {
  id: string;
  code: string | null;
  nombreCompleto: string;
  rut: string | null;
  lifecycleStatus: string;
  instalacionActual: string | null;
  sueldoBasePuestoClp: number | null;
};

export async function searchGuardiasByNameOrRut(
  tenantId: string,
  query: string,
  limit = 8,
): Promise<GuardiasSearchResult[]> {
  const clean = query.trim();
  if (!clean) return [];

  const rows = await prisma.opsGuardia.findMany({
    where: {
      tenantId,
      OR: [
        { code: { contains: clean, mode: "insensitive" } },
        { persona: { firstName: { contains: clean, mode: "insensitive" } } },
        { persona: { lastName: { contains: clean, mode: "insensitive" } } },
        { persona: { rut: { contains: clean, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      code: true,
      lifecycleStatus: true,
      persona: {
        select: {
          firstName: true,
          lastName: true,
          rut: true,
        },
      },
      currentInstallation: {
        select: {
          name: true,
        },
      },
      asignaciones: {
        where: { isActive: true },
        orderBy: [{ startDate: "desc" }],
        take: 1,
        select: {
          puesto: {
            select: {
              baseSalary: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    take: Math.max(1, Math.min(limit, 20)),
  });

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    nombreCompleto: `${row.persona.firstName} ${row.persona.lastName}`.trim(),
    rut: row.persona.rut,
    lifecycleStatus: row.lifecycleStatus,
    instalacionActual: row.currentInstallation?.name ?? null,
    sueldoBasePuestoClp: row.asignaciones[0]?.puesto.baseSalary
      ? Number(row.asignaciones[0].puesto.baseSalary)
      : null,
  }));
}

export async function getGuardiasMetrics(tenantId: string): Promise<Record<string, number>> {
  const [
    total,
    activos,
    inactivos,
    seleccionados,
    conAsignacionActiva,
    sinAsignacionActiva,
  ] = await Promise.all([
    prisma.opsGuardia.count({ where: { tenantId } }),
    prisma.opsGuardia.count({ where: { tenantId, lifecycleStatus: "contratado" } }),
    prisma.opsGuardia.count({ where: { tenantId, lifecycleStatus: "inactivo" } }),
    prisma.opsGuardia.count({ where: { tenantId, lifecycleStatus: "seleccionado" } }),
    prisma.opsAsignacionGuardia.count({ where: { tenantId, isActive: true } }),
    prisma.opsGuardia.count({
      where: {
        tenantId,
        asignaciones: {
          none: {
            isActive: true,
          },
        },
      },
    }),
  ]);

  return {
    total,
    activos,
    inactivos,
    seleccionados,
    conAsignacionActiva,
    sinAsignacionActiva,
  };
}

export type FxIndicatorsResult = {
  uf: {
    value: number;
    date: string;
    source: string | null;
  } | null;
  utm: {
    value: number;
    month: string;
    source: string | null;
  } | null;
};

export async function getUfUtmIndicators(): Promise<FxIndicatorsResult> {
  const today = new Date(`${todayChileStr()}T00:00:00Z`);

  const ufToday = await prisma.fxUfRate.findUnique({
    where: { date: today },
  });
  const ufLatest = ufToday
    ? ufToday
    : await prisma.fxUfRate.findFirst({
        orderBy: { date: "desc" },
      });

  const utmLatest = await prisma.fxUtmRate.findFirst({
    orderBy: { month: "desc" },
  });

  return {
    uf: ufLatest
      ? {
          value: Number(ufLatest.value),
          date: ufLatest.date.toISOString().slice(0, 10),
          source: ufLatest.source ?? null,
        }
      : null,
    utm: utmLatest
      ? {
          value: Number(utmLatest.value),
          month: utmLatest.month.toISOString().slice(0, 10),
          source: utmLatest.source ?? null,
        }
      : null,
  };
}

export type PendingRendicionItem = {
  id: string;
  code: string;
  status: string;
  amount: number;
  date: string;
  submitterId: string;
  submitterName: string;
  description: string | null;
};

export type PendingRendicionesResult = {
  scope: "mine" | "all";
  totalPending: number;
  items: PendingRendicionItem[];
};

export async function getPendingRendicionesForApproval(params: {
  tenantId: string;
  userId: string;
  includeAll: boolean;
  limit?: number;
}): Promise<PendingRendicionesResult> {
  const { tenantId, userId, includeAll, limit = 8 } = params;
  const take = Math.max(1, Math.min(limit, 20));
  const pendingStatuses = ["SUBMITTED", "IN_APPROVAL"];

  const baseWhere = {
    tenantId,
    status: { in: pendingStatuses },
  } as const;

  const where = includeAll
    ? baseWhere
    : {
        ...baseWhere,
        approvals: {
          some: {
            approverId: userId,
            decision: null,
          },
        },
      };

  const [totalPending, rows] = await Promise.all([
    prisma.financeRendicion.count({ where }),
    prisma.financeRendicion.findMany({
      where,
      select: {
        id: true,
        code: true,
        status: true,
        amount: true,
        date: true,
        submitterId: true,
        description: true,
      },
      orderBy: [{ createdAt: "desc" }],
      take,
    }),
  ]);

  const submitterIds = [...new Set(rows.map((r) => r.submitterId))];
  const submitters =
    submitterIds.length > 0
      ? await prisma.admin.findMany({
          where: { id: { in: submitterIds } },
          select: { id: true, name: true },
        })
      : [];
  const submitterMap = Object.fromEntries(submitters.map((s) => [s.id, s.name]));

  return {
    scope: includeAll ? "all" : "mine",
    totalPending,
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      status: row.status,
      amount: row.amount,
      date: row.date.toISOString().slice(0, 10),
      submitterId: row.submitterId,
      submitterName: submitterMap[row.submitterId] ?? row.submitterId,
      description: row.description ?? null,
    })),
  };
}
