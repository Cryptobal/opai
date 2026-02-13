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
    desvinculados,
    seleccionados,
    conAsignacionActiva,
    sinAsignacionActiva,
  ] = await Promise.all([
    prisma.opsGuardia.count({ where: { tenantId } }),
    prisma.opsGuardia.count({ where: { tenantId, lifecycleStatus: "contratado_activo" } }),
    prisma.opsGuardia.count({ where: { tenantId, lifecycleStatus: "desvinculado" } }),
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
    desvinculados,
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
