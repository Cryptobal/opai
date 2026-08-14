import { z } from "zod";

export const COST_ALLOCATION_DRIVERS = [
  "MANUAL",
  "EQUAL",
  "ACTIVE_GUARDS",
  "REQUIRED_GUARDS",
] as const;

export type CostAllocationDriver = (typeof COST_ALLOCATION_DRIVERS)[number];

export const COST_CENTER_POLICIES = [
  "NONE",
  "OPTIONAL",
  "DIRECT",
  "ALLOCABLE",
] as const;

export type CostCenterPolicy = (typeof COST_CENTER_POLICIES)[number];

export type CostCenterAssignment =
  | { mode: "NONE" }
  | { mode: "SINGLE"; installationId: string }
  | {
      mode: "SPLIT";
      driver: CostAllocationDriver;
      installations: Array<{ installationId: string; amount?: number }>;
    };

export type AllocationWeight = {
  installationId: string;
  weight: number;
  driverValue: number | null;
};

export type SplitAmountRow = {
  installationId: string;
  amount: number;
};

const uuidSchema = z.string().uuid();

export const costCenterAssignmentSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NONE") }),
  z.object({
    mode: z.literal("SINGLE"),
    installationId: uuidSchema,
  }),
  z.object({
    mode: z.literal("SPLIT"),
    driver: z.enum(COST_ALLOCATION_DRIVERS),
    installations: z
      .array(
        z.object({
          installationId: uuidSchema,
          amount: z.number().finite().optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
]);

/**
 * Reparte `amountClp` (entero) por pesos enteros con método de mayor resto.
 * El residuo (1 CLP por unidad sobrante) cae en mayor peso; empate por
 * `installationId` ascendente. No crea filas en 0. Invariante: Σ amount === amountClp
 * cuando hay al menos un peso > 0.
 */
export function splitAmountByWeights(
  amountClp: number,
  weights: Array<{ installationId: string; weight: number }>,
): SplitAmountRow[] {
  const amount = Math.round(amountClp);
  if (!Number.isFinite(amount) || amount <= 0) return [];

  const positive = weights
    .map((w) => ({
      installationId: w.installationId,
      weight: Math.round(w.weight),
    }))
    .filter((w) => w.weight > 0);
  if (positive.length === 0) return [];

  const totalWeight = positive.reduce((s, w) => s + w.weight, 0);
  if (totalWeight <= 0) return [];

  const rows = positive.map((w) => {
    const product = amount * w.weight;
    const floor = Math.floor(product / totalWeight);
    const remainder = product % totalWeight;
    return {
      installationId: w.installationId,
      amount: floor,
      remainder,
      weight: w.weight,
    };
  });

  let leftover = amount - rows.reduce((s, r) => s + r.amount, 0);
  rows.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (b.remainder !== a.remainder) return b.remainder - a.remainder;
    return a.installationId.localeCompare(b.installationId);
  });
  for (let i = 0; i < leftover && i < rows.length; i++) {
    rows[i]!.amount += 1;
  }

  return rows
    .filter((r) => r.amount > 0)
    .map((r) => ({ installationId: r.installationId, amount: r.amount }));
}

export function uniqueInstallationIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

export function assignmentHasCostCenter(
  value: CostCenterAssignment | null | undefined,
): boolean {
  if (!value || value.mode === "NONE") return false;
  if (value.mode === "SINGLE") return Boolean(value.installationId);
  return value.installations.length > 0;
}

/** Suma de montos MANUAL; `null` si no aplica. */
export function manualSplitSum(
  value: CostCenterAssignment | null | undefined,
): number | null {
  if (!value || value.mode !== "SPLIT" || value.driver !== "MANUAL") return null;
  return value.installations.reduce((s, i) => s + Math.round(i.amount ?? 0), 0);
}

export function defaultAssignmentFromPolicy(
  policy: CostCenterPolicy | null | undefined,
  isIncome: boolean,
): CostCenterAssignment {
  if (isIncome) return { mode: "NONE" };
  if (policy === "NONE") return { mode: "NONE" };
  if (policy === "DIRECT") return { mode: "SINGLE", installationId: "" };
  if (policy === "ALLOCABLE") {
    return { mode: "SPLIT", driver: "ACTIVE_GUARDS", installations: [] };
  }
  return { mode: "NONE" };
}

const DRIVER_SET = new Set<string>(COST_ALLOCATION_DRIVERS);

/** Reconstruye el assignment persistido a partir de filas de allocation. */
export function assignmentFromAllocations(
  allocations:
    | Array<{ installationId: string; amount: number; driver: string }>
    | null
    | undefined,
): CostCenterAssignment {
  if (!allocations || allocations.length === 0) return { mode: "NONE" };
  if (allocations.length === 1) {
    return { mode: "SINGLE", installationId: allocations[0]!.installationId };
  }
  const raw = allocations[0]?.driver ?? "EQUAL";
  const driver = (DRIVER_SET.has(raw) ? raw : "EQUAL") as CostAllocationDriver;
  return {
    mode: "SPLIT",
    driver,
    installations: allocations.map((a) => ({
      installationId: a.installationId,
      ...(driver === "MANUAL" ? { amount: Math.round(a.amount) } : {}),
    })),
  };
}
