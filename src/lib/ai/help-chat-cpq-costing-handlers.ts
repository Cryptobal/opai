/**
 * Handlers CPQ de costeo operacional para el asistente IA / MCP:
 * alimentación (`CpqQuoteMeal`), vehículos (`CpqQuoteVehicle`) e
 * infraestructura (`CpqQuoteInfrastructure`).
 *
 * Se exponen a través de `manage_quote_extras` (kinds `meal | vehicle |
 * infrastructure`) para mantener UNA sola tool pública de adicionales.
 * Las validaciones replican los rangos que usa la UI/PUT `/costs`; el cálculo
 * siempre queda en `computeCpqQuoteCosts` (motor canónico).
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type CostingKind = "meal" | "vehicle" | "infrastructure";

export const COSTING_KINDS: ReadonlySet<string> = new Set<CostingKind>([
  "meal",
  "vehicle",
  "infrastructure",
]);

export type CostingActionResult =
  | { ok: true }
  | { ok: false; error: string; code: string };

function asStr(o: Record<string, unknown>, k: string): string | undefined {
  const v = o[k];
  return typeof v === "string" ? v.trim() || undefined : undefined;
}

function numArg(o: Record<string, unknown>, k: string): number | undefined {
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function has(o: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
}

function boolArg(o: Record<string, unknown>, k: string): boolean | undefined {
  return typeof o[k] === "boolean" ? (o[k] as boolean) : undefined;
}

function visibilityArg(o: Record<string, unknown>): string | undefined {
  const v = asStr(o, "visibility")?.toLowerCase();
  return v === "visible" || v === "hidden" ? v : undefined;
}

const fail = (error: string, code: string): CostingActionResult => ({ ok: false, error, code });

/**
 * Valida un número dentro de rango. Devuelve el mensaje de error o null.
 * Los campos ausentes no se validan (patch parcial).
 */
function rangeError(
  value: number | undefined,
  field: string,
  min: number,
  max: number,
  integer = false,
): string | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < min || value > max) {
    return `${field} debe estar entre ${min} y ${max}.`;
  }
  if (integer && !Number.isInteger(value)) return `${field} debe ser un número entero.`;
  return null;
}

/** Lee alimentación, vehículos e infraestructura persistidos de la cotización. */
export async function listCostingExtras(quoteId: string) {
  const [meals, vehicles, infrastructure] = await Promise.all([
    prisma.cpqQuoteMeal.findMany({ where: { quoteId }, orderBy: { createdAt: "asc" } }),
    prisma.cpqQuoteVehicle.findMany({ where: { quoteId }, orderBy: { createdAt: "asc" } }),
    prisma.cpqQuoteInfrastructure.findMany({ where: { quoteId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    meal: meals.map((m) => ({
      itemId: m.id,
      mealType: m.mealType,
      mealsPerDay: m.mealsPerDay,
      daysOfService: m.daysOfService,
      priceOverride: m.priceOverride == null ? null : Number(m.priceOverride),
      enabled: m.isEnabled,
      visibility: m.visibility,
    })),
    vehicle: vehicles.map((v) => ({
      itemId: v.id,
      vehiclesCount: v.vehiclesCount,
      rentMonthly: Number(v.rentMonthly),
      kmPerDay: Number(v.kmPerDay),
      daysPerMonth: v.daysPerMonth,
      kmPerLiter: Number(v.kmPerLiter),
      fuelPrice: Number(v.fuelPrice),
      maintenanceMonthly: Number(v.maintenanceMonthly),
      enabled: v.isEnabled,
      visibility: v.visibility,
    })),
    infrastructure: infrastructure.map((i) => ({
      itemId: i.id,
      itemType: i.itemType,
      quantity: i.quantity,
      rentMonthly: Number(i.rentMonthly),
      hasFuel: i.hasFuel,
      fuelLitersPerHour: Number(i.fuelLitersPerHour),
      fuelHoursPerDay: Number(i.fuelHoursPerDay),
      fuelDaysPerMonth: i.fuelDaysPerMonth,
      fuelPrice: Number(i.fuelPrice),
      enabled: i.isEnabled,
      visibility: i.visibility,
    })),
  };
}

function mealData(args: Record<string, unknown>) {
  const data: Prisma.CpqQuoteMealUpdateManyMutationInput = {};
  const mealType = asStr(args, "mealType");
  if (mealType) data.mealType = mealType.slice(0, 100);
  const mealsPerDay = numArg(args, "mealsPerDay");
  if (mealsPerDay != null) data.mealsPerDay = Math.trunc(mealsPerDay);
  const daysOfService = numArg(args, "daysOfService");
  if (daysOfService != null) data.daysOfService = Math.trunc(daysOfService);
  if (has(args, "priceOverride")) data.priceOverride = numArg(args, "priceOverride") ?? null;
  const isEnabled = boolArg(args, "isEnabled");
  if (isEnabled !== undefined) data.isEnabled = isEnabled;
  const visibility = visibilityArg(args);
  if (visibility) data.visibility = visibility;
  return data;
}

function vehicleData(args: Record<string, unknown>) {
  const data: Prisma.CpqQuoteVehicleUpdateManyMutationInput = {};
  const vehiclesCount = numArg(args, "vehiclesCount");
  if (vehiclesCount != null) data.vehiclesCount = Math.trunc(vehiclesCount);
  for (const key of ["rentMonthly", "kmPerDay", "kmPerLiter", "fuelPrice", "maintenanceMonthly"] as const) {
    const v = numArg(args, key);
    if (v != null) data[key] = v;
  }
  const daysPerMonth = numArg(args, "daysPerMonth");
  if (daysPerMonth != null) data.daysPerMonth = Math.trunc(daysPerMonth);
  const isEnabled = boolArg(args, "isEnabled");
  if (isEnabled !== undefined) data.isEnabled = isEnabled;
  const visibility = visibilityArg(args);
  if (visibility) data.visibility = visibility;
  return data;
}

function infrastructureData(args: Record<string, unknown>) {
  const data: Prisma.CpqQuoteInfrastructureUpdateManyMutationInput = {};
  const itemType = asStr(args, "itemType");
  if (itemType) data.itemType = itemType.slice(0, 100);
  const quantity = numArg(args, "quantity");
  if (quantity != null) data.quantity = Math.trunc(quantity);
  const rentMonthly = numArg(args, "rentMonthly");
  if (rentMonthly != null) data.rentMonthly = rentMonthly;
  const hasFuel = boolArg(args, "hasFuel");
  if (hasFuel !== undefined) data.hasFuel = hasFuel;
  for (const key of ["fuelLitersPerHour", "fuelHoursPerDay", "fuelPrice"] as const) {
    const v = numArg(args, key);
    if (v != null) data[key] = v;
  }
  const fuelDaysPerMonth = numArg(args, "fuelDaysPerMonth");
  if (fuelDaysPerMonth != null) data.fuelDaysPerMonth = Math.trunc(fuelDaysPerMonth);
  const isEnabled = boolArg(args, "isEnabled");
  if (isEnabled !== undefined) data.isEnabled = isEnabled;
  const visibility = visibilityArg(args);
  if (visibility) data.visibility = visibility;
  return data;
}

/** Valida los rangos del kind indicado; devuelve error accionable o null. */
function validateCostingArgs(kind: CostingKind, args: Record<string, unknown>): string | null {
  if (kind === "meal") {
    return (
      rangeError(numArg(args, "mealsPerDay"), "mealsPerDay", 0, 10, true) ??
      rangeError(numArg(args, "daysOfService"), "daysOfService", 0, 31, true) ??
      rangeError(numArg(args, "priceOverride"), "priceOverride", 0, 10_000_000)
    );
  }
  if (kind === "vehicle") {
    return (
      rangeError(numArg(args, "vehiclesCount"), "vehiclesCount", 1, 999, true) ??
      rangeError(numArg(args, "rentMonthly"), "rentMonthly", 0, 100_000_000) ??
      rangeError(numArg(args, "kmPerDay"), "kmPerDay", 0, 5_000) ??
      rangeError(numArg(args, "daysPerMonth"), "daysPerMonth", 0, 31, true) ??
      rangeError(numArg(args, "kmPerLiter"), "kmPerLiter", 0, 100) ??
      rangeError(numArg(args, "fuelPrice"), "fuelPrice", 0, 100_000) ??
      rangeError(numArg(args, "maintenanceMonthly"), "maintenanceMonthly", 0, 100_000_000)
    );
  }
  return (
    rangeError(numArg(args, "quantity"), "quantity", 1, 9_999, true) ??
    rangeError(numArg(args, "rentMonthly"), "rentMonthly", 0, 100_000_000) ??
    rangeError(numArg(args, "fuelLitersPerHour"), "fuelLitersPerHour", 0, 1_000) ??
    rangeError(numArg(args, "fuelHoursPerDay"), "fuelHoursPerDay", 0, 24) ??
    rangeError(numArg(args, "fuelDaysPerMonth"), "fuelDaysPerMonth", 0, 31, true) ??
    rangeError(numArg(args, "fuelPrice"), "fuelPrice", 0, 100_000)
  );
}

/**
 * Aplica add/update/remove sobre alimentación, vehículos o infraestructura.
 * El caller resuelve la cotización, el permiso y el recompute.
 */
export async function applyCostingKindAction(opts: {
  kind: CostingKind;
  quoteId: string;
  action: "add" | "update" | "remove";
  args: Record<string, unknown>;
}): Promise<CostingActionResult> {
  const { kind, quoteId, action, args } = opts;

  const invalid = validateCostingArgs(kind, args);
  if (invalid) return fail(invalid, "range");

  if (action === "add") {
    if (kind === "meal") {
      const mealType = asStr(args, "mealType");
      if (!mealType) {
        return fail(
          "Indica mealType (ej. 'Almuerzo', 'Cena'). Debe coincidir con un ítem de catálogo tipo comida o traer priceOverride.",
          "mealType",
        );
      }
      await prisma.cpqQuoteMeal.create({
        data: {
          quoteId,
          mealType: mealType.slice(0, 100),
          mealsPerDay: Math.trunc(numArg(args, "mealsPerDay") ?? 1),
          daysOfService: Math.trunc(numArg(args, "daysOfService") ?? 30),
          priceOverride: numArg(args, "priceOverride") ?? null,
          isEnabled: boolArg(args, "isEnabled") ?? true,
          visibility: visibilityArg(args) ?? "visible",
        },
      });
      return { ok: true };
    }
    if (kind === "vehicle") {
      await prisma.cpqQuoteVehicle.create({
        data: {
          quoteId,
          vehiclesCount: Math.trunc(numArg(args, "vehiclesCount") ?? 1),
          rentMonthly: numArg(args, "rentMonthly") ?? 0,
          kmPerDay: numArg(args, "kmPerDay") ?? 0,
          daysPerMonth: Math.trunc(numArg(args, "daysPerMonth") ?? 0),
          kmPerLiter: numArg(args, "kmPerLiter") ?? 0,
          fuelPrice: numArg(args, "fuelPrice") ?? 0,
          maintenanceMonthly: numArg(args, "maintenanceMonthly") ?? 0,
          isEnabled: boolArg(args, "isEnabled") ?? true,
          visibility: visibilityArg(args) ?? "visible",
        },
      });
      return { ok: true };
    }
    const itemType = asStr(args, "itemType");
    if (!itemType) {
      return fail("Indica itemType de la infraestructura (ej. 'Garita', 'Generador').", "itemType");
    }
    await prisma.cpqQuoteInfrastructure.create({
      data: {
        quoteId,
        itemType: itemType.slice(0, 100),
        quantity: Math.trunc(numArg(args, "quantity") ?? 1),
        rentMonthly: numArg(args, "rentMonthly") ?? 0,
        hasFuel: boolArg(args, "hasFuel") ?? false,
        fuelLitersPerHour: numArg(args, "fuelLitersPerHour") ?? 0,
        fuelHoursPerDay: numArg(args, "fuelHoursPerDay") ?? 0,
        fuelDaysPerMonth: Math.trunc(numArg(args, "fuelDaysPerMonth") ?? 0),
        fuelPrice: numArg(args, "fuelPrice") ?? 0,
        isEnabled: boolArg(args, "isEnabled") ?? true,
        visibility: visibilityArg(args) ?? "visible",
      },
    });
    return { ok: true };
  }

  const itemId = asStr(args, "itemId");
  if (!itemId) return fail("Indica itemId (usa action=list para verlo).", "itemId");
  const where = { id: itemId, quoteId };

  if (kind === "meal") {
    const existing = await prisma.cpqQuoteMeal.findFirst({ where, select: { id: true } });
    if (!existing) return fail("No encontré esa línea de alimentación en la cotización.", "notfound");
    if (action === "remove") {
      await prisma.cpqQuoteMeal.deleteMany({ where });
      return { ok: true };
    }
    const data = mealData(args);
    if (Object.keys(data).length === 0) return fail("Indica al menos un campo a cambiar.", "nofields");
    await prisma.cpqQuoteMeal.updateMany({ where, data });
    return { ok: true };
  }

  if (kind === "vehicle") {
    const existing = await prisma.cpqQuoteVehicle.findFirst({ where, select: { id: true } });
    if (!existing) return fail("No encontré ese vehículo en la cotización.", "notfound");
    if (action === "remove") {
      await prisma.cpqQuoteVehicle.deleteMany({ where });
      return { ok: true };
    }
    const data = vehicleData(args);
    if (Object.keys(data).length === 0) return fail("Indica al menos un campo a cambiar.", "nofields");
    await prisma.cpqQuoteVehicle.updateMany({ where, data });
    return { ok: true };
  }

  const existing = await prisma.cpqQuoteInfrastructure.findFirst({ where, select: { id: true } });
  if (!existing) return fail("No encontré esa infraestructura en la cotización.", "notfound");
  if (action === "remove") {
    await prisma.cpqQuoteInfrastructure.deleteMany({ where });
    return { ok: true };
  }
  const data = infrastructureData(args);
  if (Object.keys(data).length === 0) return fail("Indica al menos un campo a cambiar.", "nofields");
  await prisma.cpqQuoteInfrastructure.updateMany({ where, data });
  return { ok: true };
}
