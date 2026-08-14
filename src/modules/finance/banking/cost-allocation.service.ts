import "server-only";
import { prisma } from "@/lib/prisma";
import { Decimal } from "@prisma/client/runtime/library";
import type {
  FinanceCostAllocationDriver,
  Prisma,
} from "@prisma/client";
import {
  splitAmountByWeights,
  uniqueInstallationIds,
  type CostAllocationDriver,
  type CostCenterAssignment,
  type AllocationWeight,
} from "./cost-allocation-math";
import { recognizeRutsForTransactions } from "./rut-recognition.service";

const MAX_INSTALLATIONS = 200;

export type AllocationInstallRow = {
  id: string;
  name: string;
  accountId: string | null;
  accountName: string | null;
  commune: string | null;
  status: string;
  activeGuards: number;
  requiredGuards: number;
};

export type ComputedAllocationRow = {
  installationId: string;
  costCenterId: string | null;
  amount: number;
  weight: number;
  driver: CostAllocationDriver;
  driverValue: number | null;
};

export type ComputeWeightsResult = {
  weights: AllocationWeight[];
  excluded: string[];
};

type DbClient = Prisma.TransactionClient | typeof prisma;

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function assertInstallationsBelongToTenant(
  tenantId: string,
  installationIds: string[],
  db: DbClient = prisma,
): Promise<void> {
  const ids = uniqueInstallationIds(installationIds);
  if (ids.length === 0) return;
  if (ids.length > MAX_INSTALLATIONS) {
    throw new Error(`Máximo ${MAX_INSTALLATIONS} instalaciones por operación`);
  }
  const found = await db.crmInstallation.findMany({
    where: { tenantId, id: { in: ids } },
    select: { id: true },
  });
  if (found.length !== ids.length) {
    throw new Error(
      "Una o más instalaciones no existen o no pertenecen a la empresa",
    );
  }
}

async function sumRequiredGuardsByInstallation(
  tenantId: string,
  installationIds: string[],
  refDate: Date,
  db: DbClient,
): Promise<Map<string, number>> {
  if (installationIds.length === 0) return new Map();
  const puestos = await db.opsPuestoOperativo.findMany({
    where: {
      tenantId,
      installationId: { in: installationIds },
      active: true,
      AND: [
        { OR: [{ activeFrom: null }, { activeFrom: { lte: refDate } }] },
        { OR: [{ activeUntil: null }, { activeUntil: { gte: refDate } }] },
      ],
    },
    select: { installationId: true, requiredGuards: true },
  });
  const map = new Map<string, number>();
  for (const p of puestos) {
    map.set(p.installationId, (map.get(p.installationId) ?? 0) + p.requiredGuards);
  }
  return map;
}

export async function computeAllocationWeights(opts: {
  tenantId: string;
  installationIds: string[];
  driver: CostAllocationDriver;
  refDate: Date;
  db?: DbClient;
}): Promise<ComputeWeightsResult> {
  const db = opts.db ?? prisma;
  const ids = uniqueInstallationIds(opts.installationIds);
  const refDate = dateOnly(opts.refDate);
  const excluded: string[] = [];

  if (ids.length === 0) return { weights: [], excluded };

  if (opts.driver === "EQUAL") {
    return {
      weights: ids.map((installationId) => ({
        installationId,
        weight: 1,
        driverValue: null,
      })),
      excluded,
    };
  }

  if (opts.driver === "MANUAL") {
    return {
      weights: ids.map((installationId) => ({
        installationId,
        weight: 0,
        driverValue: null,
      })),
      excluded,
    };
  }

  const requiredMap = await sumRequiredGuardsByInstallation(
    opts.tenantId,
    ids,
    refDate,
    db,
  );

  if (opts.driver === "REQUIRED_GUARDS") {
    const weights: AllocationWeight[] = [];
    for (const id of ids) {
      const required = requiredMap.get(id) ?? 0;
      if (required <= 0) {
        excluded.push(id);
        continue;
      }
      weights.push({ installationId: id, weight: required, driverValue: required });
    }
    return { weights, excluded };
  }

  // ACTIVE_GUARDS
  const asignaciones = await db.opsAsignacionGuardia.findMany({
    where: {
      tenantId: opts.tenantId,
      installationId: { in: ids },
      isActive: true,
      startDate: { lte: refDate },
      OR: [{ endDate: null }, { endDate: { gte: refDate } }],
    },
    select: { installationId: true, guardiaId: true },
  });
  const activeSet = new Map<string, Set<string>>();
  for (const a of asignaciones) {
    let set = activeSet.get(a.installationId);
    if (!set) {
      set = new Set();
      activeSet.set(a.installationId, set);
    }
    set.add(a.guardiaId);
  }

  const weights: AllocationWeight[] = [];
  for (const id of ids) {
    const active = activeSet.get(id)?.size ?? 0;
    if (active > 0) {
      weights.push({ installationId: id, weight: active, driverValue: active });
      continue;
    }
    const required = requiredMap.get(id) ?? 0;
    if (required > 0) {
      weights.push({
        installationId: id,
        weight: required,
        driverValue: required,
      });
      continue;
    }
    excluded.push(id);
  }
  return { weights, excluded };
}

export async function resolveCostCenterIdsForInstallations(
  tenantId: string,
  installationIds: string[],
  db: DbClient = prisma,
): Promise<Map<string, string>> {
  const ids = uniqueInstallationIds(installationIds);
  const result = new Map<string, string>();
  if (ids.length === 0) return result;

  const [existing, installations] = await Promise.all([
    db.financeCostCenter.findMany({
      where: { tenantId, installationId: { in: ids } },
      select: { id: true, installationId: true },
    }),
    db.crmInstallation.findMany({
      where: { tenantId, id: { in: ids } },
      select: { id: true, name: true, accountId: true },
    }),
  ]);
  for (const cc of existing) {
    if (cc.installationId) result.set(cc.installationId, cc.id);
  }

  const missing = installations.filter((i) => !result.has(i.id));
  for (const inst of missing) {
    const created = await db.financeCostCenter.create({
      data: {
        tenantId,
        name: inst.name,
        active: true,
        installationId: inst.id,
        accountId: inst.accountId ?? null,
      },
      select: { id: true },
    });
    result.set(inst.id, created.id);
  }
  return result;
}

export async function listInstallationsForAllocation(opts: {
  tenantId: string;
  scope: "all" | "account";
  accountId?: string | null;
  q?: string | null;
  includeIds?: string[];
  refDate?: Date;
}): Promise<AllocationInstallRow[]> {
  const refDate = dateOnly(opts.refDate ?? new Date());
  const q = opts.q?.trim() ?? "";
  const includeIds = uniqueInstallationIds(opts.includeIds ?? []);

  const whereActive: Prisma.CrmInstallationWhereInput = {
    tenantId: opts.tenantId,
    status: "active",
    ...(opts.scope === "account" && opts.accountId
      ? { accountId: opts.accountId }
      : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { commune: { contains: q, mode: "insensitive" } },
            { account: { name: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const where: Prisma.CrmInstallationWhereInput =
    includeIds.length > 0
      ? {
          tenantId: opts.tenantId,
          OR: [whereActive, { id: { in: includeIds } }],
        }
      : whereActive;

  const installations = await prisma.crmInstallation.findMany({
    where,
    select: {
      id: true,
      name: true,
      commune: true,
      status: true,
      accountId: true,
      account: { select: { id: true, name: true } },
    },
    orderBy: [{ account: { name: "asc" } }, { name: "asc" }],
    take: 400,
  });

  const ids = installations.map((i) => i.id);
  const [activeMap, requiredMap] = await Promise.all([
    (async () => {
      const asignaciones = await prisma.opsAsignacionGuardia.findMany({
        where: {
          tenantId: opts.tenantId,
          installationId: { in: ids },
          isActive: true,
          startDate: { lte: refDate },
          OR: [{ endDate: null }, { endDate: { gte: refDate } }],
        },
        select: { installationId: true, guardiaId: true },
      });
      const set = new Map<string, Set<string>>();
      for (const a of asignaciones) {
        let s = set.get(a.installationId);
        if (!s) {
          s = new Set();
          set.set(a.installationId, s);
        }
        s.add(a.guardiaId);
      }
      const map = new Map<string, number>();
      for (const [id, guards] of set) map.set(id, guards.size);
      return map;
    })(),
    sumRequiredGuardsByInstallation(opts.tenantId, ids, refDate, prisma),
  ]);

  return installations.map((i) => ({
    id: i.id,
    name: i.name,
    accountId: i.accountId ?? i.account?.id ?? null,
    accountName: i.account?.name ?? null,
    commune: i.commune,
    status: i.status,
    activeGuards: activeMap.get(i.id) ?? 0,
    requiredGuards: requiredMap.get(i.id) ?? 0,
  }));
}

export async function getCostCenterPolicyForAccountPlan(
  tenantId: string,
  accountPlanId: string | null | undefined,
): Promise<"NONE" | "OPTIONAL" | "DIRECT" | "ALLOCABLE"> {
  if (!accountPlanId) return "OPTIONAL";
  const plan = await prisma.financeAccountPlan.findFirst({
    where: { id: accountPlanId, tenantId },
    select: { costCenterPolicy: true },
  });
  return plan?.costCenterPolicy ?? "OPTIONAL";
}

/**
 * Calcula las filas a persistir. Valida tenant, cuadre y dotación.
 * No escribe. `amount` del assignment MANUAL se usa; el resto se calcula en servidor.
 */
export async function buildAllocationRows(opts: {
  tenantId: string;
  linkAmount: number;
  assignment: CostCenterAssignment | undefined;
  refDate: Date;
  db?: DbClient;
}): Promise<{ rows: ComputedAllocationRow[]; excluded: string[] }> {
  const assignment = opts.assignment;
  if (!assignment || assignment.mode === "NONE") {
    return { rows: [], excluded: [] };
  }

  const db = opts.db ?? prisma;
  const linkAmount = Math.round(Math.abs(opts.linkAmount));
  if (linkAmount <= 0) return { rows: [], excluded: [] };

  if (assignment.mode === "SINGLE") {
    if (!assignment.installationId) {
      throw new Error("Elegí una instalación para el centro de costo");
    }
    await assertInstallationsBelongToTenant(opts.tenantId, [
      assignment.installationId,
    ], db);
    const ccMap = await resolveCostCenterIdsForInstallations(
      opts.tenantId,
      [assignment.installationId],
      db,
    );
    return {
      rows: [
        {
          installationId: assignment.installationId,
          costCenterId: ccMap.get(assignment.installationId) ?? null,
          amount: linkAmount,
          weight: 1,
          driver: "EQUAL",
          driverValue: null,
        },
      ],
      excluded: [],
    };
  }

  const ids = uniqueInstallationIds(
    assignment.installations.map((i) => i.installationId),
  );
  if (ids.length === 0) {
    throw new Error("Elegí al menos una instalación para repartir");
  }
  await assertInstallationsBelongToTenant(opts.tenantId, ids, db);

  const driver: CostAllocationDriver = assignment.driver;

  if (driver === "MANUAL") {
    const amountById = new Map<string, number>();
    for (const item of assignment.installations) {
      const amt = Math.round(item.amount ?? 0);
      if (!Number.isFinite(amt)) {
        throw new Error("Cada instalación en modo manual requiere un monto");
      }
      amountById.set(item.installationId, amt);
    }
    for (const id of ids) {
      if (!amountById.has(id) || amountById.get(id) == null) {
        throw new Error("Cada instalación en modo manual requiere un monto");
      }
    }
    const sum = [...amountById.values()].reduce((s, n) => s + n, 0);
    if (sum !== linkAmount) {
      const delta = linkAmount - sum;
      throw new Error(
        delta > 0
          ? `El reparto no cuadra: faltan $${delta.toLocaleString("es-CL")}`
          : `El reparto no cuadra: sobran $${Math.abs(delta).toLocaleString("es-CL")}`,
      );
    }
    const ccMap = await resolveCostCenterIdsForInstallations(
      opts.tenantId,
      ids,
      db,
    );
    const rows: ComputedAllocationRow[] = [];
    for (const id of ids) {
      const amount = amountById.get(id) ?? 0;
      if (amount <= 0) continue;
      rows.push({
        installationId: id,
        costCenterId: ccMap.get(id) ?? null,
        amount,
        weight: linkAmount > 0 ? amount / linkAmount : 0,
        driver: "MANUAL",
        driverValue: null,
      });
    }
    return { rows, excluded: [] };
  }

  const computed = await computeAllocationWeights({
    tenantId: opts.tenantId,
    installationIds: ids,
    driver,
    refDate: opts.refDate,
    db,
  });
  if (computed.weights.length === 0) {
    throw new Error(
      "Ninguna instalación seleccionada tiene dotación; elegí partes iguales o asigná manualmente",
    );
  }
  const split = splitAmountByWeights(linkAmount, computed.weights);
  const splitSum = split.reduce((s, r) => s + r.amount, 0);
  if (splitSum !== linkAmount) {
    throw new Error("El reparto calculado no cuadra con el monto del vínculo");
  }
  const weightById = new Map(computed.weights.map((w) => [w.installationId, w]));
  const totalWeight = computed.weights.reduce((s, w) => s + w.weight, 0);
  const ccMap = await resolveCostCenterIdsForInstallations(
    opts.tenantId,
    split.map((s) => s.installationId),
    db,
  );
  const rows: ComputedAllocationRow[] = split.map((s) => {
    const w = weightById.get(s.installationId);
    return {
      installationId: s.installationId,
      costCenterId: ccMap.get(s.installationId) ?? null,
      amount: s.amount,
      weight: totalWeight > 0 && w ? w.weight / totalWeight : 0,
      driver,
      driverValue: w?.driverValue ?? null,
    };
  });
  return { rows, excluded: computed.excluded };
}

export async function replaceLinkAllocations(
  db: Prisma.TransactionClient,
  opts: {
    tenantId: string;
    linkId: string;
    linkAmount: number;
    assignment: CostCenterAssignment | undefined;
    refDate: Date;
  },
): Promise<void> {
  await db.financeBankLinkAllocation.deleteMany({
    where: { tenantId: opts.tenantId, linkId: opts.linkId },
  });
  const { rows } = await buildAllocationRows({
    tenantId: opts.tenantId,
    linkAmount: opts.linkAmount,
    assignment: opts.assignment,
    refDate: opts.refDate,
    db,
  });
  if (rows.length === 0) return;
  const sum = rows.reduce((s, r) => s + r.amount, 0);
  const expected = Math.round(Math.abs(opts.linkAmount));
  if (sum !== expected) {
    throw new Error(
      `Invariante de distribución: Σ allocations (${sum}) ≠ monto del link (${expected})`,
    );
  }
  await db.financeBankLinkAllocation.createMany({
    data: rows.map((r) => ({
      tenantId: opts.tenantId,
      linkId: opts.linkId,
      installationId: r.installationId,
      costCenterId: r.costCenterId,
      amount: new Decimal(r.amount),
      weight: new Decimal(r.weight.toFixed(6)),
      driver: r.driver as FinanceCostAllocationDriver,
      driverValue:
        r.driverValue == null ? null : new Decimal(r.driverValue),
    })),
  });
}

export type EnrichedAllocation = {
  id: string;
  installationId: string;
  installationName: string;
  accountName: string | null;
  costCenterId: string | null;
  amount: number;
  weight: number;
  driver: CostAllocationDriver;
  driverValue: number | null;
};

export async function loadAllocationsForLinks(
  tenantId: string,
  linkIds: string[],
): Promise<Map<string, EnrichedAllocation[]>> {
  const result = new Map<string, EnrichedAllocation[]>();
  if (linkIds.length === 0) return result;
  const rows = await prisma.financeBankLinkAllocation.findMany({
    where: { tenantId, linkId: { in: linkIds } },
    include: {
      installation: {
        select: {
          id: true,
          name: true,
          account: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const r of rows) {
    const list = result.get(r.linkId) ?? [];
    list.push({
      id: r.id,
      installationId: r.installationId,
      installationName: r.installation.name,
      accountName: r.installation.account?.name ?? null,
      costCenterId: r.costCenterId,
      amount: r.amount.toNumber(),
      weight: r.weight.toNumber(),
      driver: r.driver,
      driverValue: r.driverValue ? r.driverValue.toNumber() : null,
    });
    result.set(r.linkId, list);
  }
  return result;
}

/**
 * Hereda instalación desde TE o liquidación cuando el body no trae costCenter.
 * Si no se puede determinar, retorna null (el caller usa NONE).
 */
export async function inferCostCenterFromClassifySource(opts: {
  tenantId: string;
  source: "te" | "payroll";
  bankTx: {
    id: string;
    amount: number;
    description: string | null;
    reference: string | null;
  };
}): Promise<CostCenterAssignment | null> {
  const identityMap = await recognizeRutsForTransactions(opts.tenantId, [
    {
      id: opts.bankTx.id,
      description: opts.bankTx.description,
      reference: opts.bankTx.reference,
    },
  ]);
  const identity = identityMap.get(opts.bankTx.id);
  if (identity?.kind !== "guardia" || !identity.entityId) return null;

  const guardiaId = identity.entityId;
  const amountAbs = Math.round(Math.abs(opts.bankTx.amount));

  if (opts.source === "te") {
    const tes = await prisma.opsTurnoExtra.findMany({
      where: {
        tenantId: opts.tenantId,
        guardiaId,
        status: "approved",
        paidAt: null,
      },
      select: { installationId: true, amountClp: true },
      orderBy: { date: "desc" },
      take: 50,
    });
    return assignmentFromOriginItems(
      tes.map((t) => ({
        installationId: t.installationId,
        amount: Math.round(Number(t.amountClp)),
      })),
      amountAbs,
    );
  }

  const liqs = await prisma.payrollLiquidacion.findMany({
    where: {
      tenantId: opts.tenantId,
      guardiaId,
      status: "APPROVED",
      paidAt: null,
      installationId: { not: null },
    },
    select: { installationId: true, netSalary: true },
    take: 20,
  });
  return assignmentFromOriginItems(
    liqs
      .filter((l): l is typeof l & { installationId: string } =>
        Boolean(l.installationId),
      )
      .map((l) => ({
        installationId: l.installationId,
        amount: Math.round(Number(l.netSalary)),
      })),
    amountAbs,
  );
}

function assignmentFromOriginItems(
  items: Array<{ installationId: string; amount: number }>,
  targetAmount: number,
): CostCenterAssignment | null {
  const valid = items.filter((i) => i.installationId && i.amount > 0);
  if (valid.length === 0) return null;

  const byInst = new Map<string, number>();
  for (const i of valid) {
    byInst.set(i.installationId, (byInst.get(i.installationId) ?? 0) + i.amount);
  }
  const entries = [...byInst.entries()];
  if (entries.length === 1) {
    return { mode: "SINGLE", installationId: entries[0]![0] };
  }

  const originTotal = entries.reduce((s, [, a]) => s + a, 0);
  if (originTotal <= 0) return null;
  const split = splitAmountByWeights(
    targetAmount,
    entries.map(([installationId, amount]) => ({
      installationId,
      weight: amount,
    })),
  );
  return {
    mode: "SPLIT",
    driver: "MANUAL",
    installations: split.map((s) => ({
      installationId: s.installationId,
      amount: s.amount,
    })),
  };
}

export type AllocationPreviewRow = {
  installationId: string;
  installationName: string;
  accountName: string | null;
  driverValue: number | null;
  weightPct: number;
  amount: number;
  excluded?: boolean;
};

export async function previewCostCenterAssignment(opts: {
  tenantId: string;
  amountAbs: number;
  assignment: CostCenterAssignment;
  refDate?: Date;
}): Promise<{
  rows: AllocationPreviewRow[];
  excluded: AllocationPreviewRow[];
  total: number;
}> {
  if (opts.assignment.mode === "NONE") {
    return { rows: [], excluded: [], total: 0 };
  }
  const { rows, excluded } = await buildAllocationRows({
    tenantId: opts.tenantId,
    linkAmount: opts.amountAbs,
    assignment: opts.assignment,
    refDate: opts.refDate ?? new Date(),
  });
  const ids = [
    ...rows.map((r) => r.installationId),
    ...excluded,
  ];
  const inst = ids.length
    ? await prisma.crmInstallation.findMany({
        where: { tenantId: opts.tenantId, id: { in: ids } },
        select: {
          id: true,
          name: true,
          account: { select: { name: true } },
        },
      })
    : [];
  const byId = new Map(inst.map((i) => [i.id, i]));
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
  return {
    rows: rows.map((r) => {
      const i = byId.get(r.installationId);
      return {
        installationId: r.installationId,
        installationName: i?.name ?? r.installationId,
        accountName: i?.account?.name ?? null,
        driverValue: r.driverValue,
        weightPct: totalWeight > 0 ? r.weight / totalWeight : r.weight,
        amount: r.amount,
      };
    }),
    excluded: excluded.map((id) => {
      const i = byId.get(id);
      return {
        installationId: id,
        installationName: i?.name ?? id,
        accountName: i?.account?.name ?? null,
        driverValue: 0,
        weightPct: 0,
        amount: 0,
        excluded: true,
      };
    }),
    total: rows.reduce((s, r) => s + r.amount, 0),
  };
}
