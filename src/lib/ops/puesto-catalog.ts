import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isTenantModuleEnabled } from "@/lib/tenant-modules";

export const INVALID_PUESTO_CATALOG_ERROR = "Catálogo inválido para este tenant";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseIncludeIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = part.trim();
    if (!UUID_RE.test(id) || seen.has(id)) continue;
    seen.add(id);
  }
  return [...seen];
}

export function cpqCatalogWhere(tenantId: string, includeIds: string[]) {
  return {
    AND: [
      { OR: [{ tenantId }, { tenantId: null }] },
      includeIds.length > 0
        ? { OR: [{ active: true }, { id: { in: includeIds } }] }
        : { active: true },
    ],
  };
}

export function bonoCatalogWhere(tenantId: string, includeIds: string[]) {
  return {
    tenantId,
    ...(includeIds.length > 0
      ? { OR: [{ isActive: true }, { id: { in: includeIds } }] }
      : { isActive: true }),
  };
}

function catalogDecimal(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export type PuestoCatalogIds = {
  cargoId?: string | null;
  rolId?: string | null;
  puestoTrabajoId?: string | null;
  bonos?: Array<{ bonoCatalogId?: string | null } | null> | null;
};

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

/**
 * Verifica que cargo/rol/puesto pertenezcan al tenant (o sean globales) y
 * que cada bono pertenezca al tenant. No filtra por active: un puesto en
 * edición puede conservar un catálogo ya desactivado.
 */
export async function assertPuestoCatalogOwnership(
  tenantId: string,
  input: PuestoCatalogIds,
): Promise<NextResponse | null> {
  const checks: Promise<boolean>[] = [];

  if (input.cargoId) {
    checks.push(
      prisma.cpqCargo
        .findFirst({
          where: { id: input.cargoId, OR: [{ tenantId }, { tenantId: null }] },
          select: { id: true },
        })
        .then(Boolean),
    );
  }
  if (input.rolId) {
    checks.push(
      prisma.cpqRol
        .findFirst({
          where: { id: input.rolId, OR: [{ tenantId }, { tenantId: null }] },
          select: { id: true },
        })
        .then(Boolean),
    );
  }
  if (input.puestoTrabajoId) {
    checks.push(
      prisma.cpqPuestoTrabajo
        .findFirst({
          where: { id: input.puestoTrabajoId, OR: [{ tenantId }, { tenantId: null }] },
          select: { id: true },
        })
        .then(Boolean),
    );
  }

  const bonoIds = uniqueIds((input.bonos ?? []).map((b) => b?.bonoCatalogId));
  if (bonoIds.length > 0) {
    checks.push(
      prisma.payrollBonoCatalog
        .findMany({
          where: { id: { in: bonoIds }, tenantId },
          select: { id: true },
        })
        .then((rows) => rows.length === bonoIds.length),
    );
  }

  if (checks.length === 0) return null;

  const results = await Promise.all(checks);
  if (results.some((ok) => !ok)) {
    return NextResponse.json(
      { success: false, error: INVALID_PUESTO_CATALOG_ERROR },
      { status: 400 },
    );
  }
  return null;
}

export async function loadPuestoFormCatalogs(tenantId: string, includeIds: string[]) {
  const payrollEnabled = await isTenantModuleEnabled(tenantId, "payroll");
  const cpqWhere = cpqCatalogWhere(tenantId, includeIds);

  const [cargos, roles, puestos, bonos] = await Promise.all([
    prisma.cpqCargo.findMany({
      where: cpqWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, active: true },
    }),
    prisma.cpqRol.findMany({
      where: cpqWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, description: true, active: true },
    }),
    prisma.cpqPuestoTrabajo.findMany({
      where: cpqWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    payrollEnabled
      ? prisma.payrollBonoCatalog.findMany({
          where: bonoCatalogWhere(tenantId, includeIds),
          orderBy: { name: "asc" },
          select: {
            id: true,
            code: true,
            name: true,
            bonoType: true,
            isTaxable: true,
            isTributable: true,
            defaultAmount: true,
            defaultPercentage: true,
            conditionType: true,
            isActive: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return {
    cargos,
    roles,
    puestos,
    bonos: bonos.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.name,
      bonoType: b.bonoType,
      isTaxable: b.isTaxable,
      isTributable: b.isTributable,
      defaultAmount: catalogDecimal(b.defaultAmount),
      defaultPercentage: catalogDecimal(b.defaultPercentage),
      conditionType: b.conditionType,
      active: b.isActive,
    })),
    payrollEnabled,
  };
}
