import { describe, expect, it } from "vitest";
import type { CpqQuoteCostItem, CpqQuoteVehicle } from "@/types/cpq";
import {
  additionalCostsVehicleRowTotal,
  computeQuoteVehicleBreakdown,
  countEnabledQuoteVehicles,
  listEnabledQuoteVehicleBreakdowns,
} from "../quote-vehicle-costs";

/** Extra vehicle de CPQ-2026-287 (prod, no mutar): 1 camioneta. */
const CPQ_287_VEHICLE: CpqQuoteVehicle = {
  vehiclesCount: 1,
  rentMonthly: 1_800_000,
  kmPerDay: 80,
  daysPerMonth: 30,
  kmPerLiter: 10,
  fuelPrice: 1250,
  maintenanceMonthly: 80_000,
  isEnabled: true,
  visibility: "visible",
};

const LOOSE_CAMIONETA_ITEM: CpqQuoteCostItem = {
  customName: "Camioneta",
  customType: "other",
  calcMode: "per_month",
  quantity: 1,
  unitPriceOverride: 1_800_000,
  isEnabled: true,
  visibility: "visible",
};

describe("additionalCostsVehicleRowTotal — fila Vehículos", () => {
  it("extra vehicle enabled → fila = arriendo + combustible + mantención", () => {
    expect(additionalCostsVehicleRowTotal([CPQ_287_VEHICLE])).toBe(2_180_000);
  });

  it("extra disabled o ausente → $0", () => {
    expect(
      additionalCostsVehicleRowTotal([{ ...CPQ_287_VEHICLE, isEnabled: false }]),
    ).toBe(0);
    expect(additionalCostsVehicleRowTotal([])).toBe(0);
  });

  it("no usa extras de nombre libre como parche de la fila", () => {
    expect(LOOSE_CAMIONETA_ITEM.customType).toBe("other");
    // El total de catálogo tipado lo pasa el caller; un extra suelto "Camioneta"
    // no es vehicle_rent/fuel/tag y no se pasa aquí.
    expect(additionalCostsVehicleRowTotal([CPQ_287_VEHICLE], 0)).toBe(2_180_000);
    expect(additionalCostsVehicleRowTotal([], 0)).toBe(0);
  });

  it("costItems tipados de catálogo se suman al extra, no lo reemplazan", () => {
    expect(additionalCostsVehicleRowTotal([CPQ_287_VEHICLE], 50_000)).toBe(2_230_000);
  });
});

describe("computeQuoteVehicleBreakdown — expansión", () => {
  it("expone arriendo, combustible y mantención por separado", () => {
    const row = computeQuoteVehicleBreakdown(CPQ_287_VEHICLE);
    expect(row.rent).toBe(1_800_000);
    expect(row.fuel).toBe(300_000);
    expect(row.maintenance).toBe(80_000);
    expect(row.total).toBe(2_180_000);
    expect(row.parts.map((p) => p.label)).toEqual([
      "Arriendo",
      "Combustible",
      "Mantención",
    ]);
    expect(row.parts.map((p) => p.amount)).toEqual([1_800_000, 300_000, 80_000]);
  });

  it("multiplica las partes por vehiclesCount", () => {
    const row = computeQuoteVehicleBreakdown({
      ...CPQ_287_VEHICLE,
      vehiclesCount: 2,
    });
    expect(row.rent).toBe(3_600_000);
    expect(row.fuel).toBe(600_000);
    expect(row.maintenance).toBe(160_000);
    expect(row.total).toBe(4_360_000);
  });
});

describe("listEnabledQuoteVehicleBreakdowns", () => {
  it("omite extras disabled y cuenta unidades habilitadas", () => {
    const rows = listEnabledQuoteVehicleBreakdowns([
      CPQ_287_VEHICLE,
      { ...CPQ_287_VEHICLE, id: "off", isEnabled: false },
    ]);
    expect(rows).toHaveLength(1);
    expect(countEnabledQuoteVehicles([CPQ_287_VEHICLE, { ...CPQ_287_VEHICLE, isEnabled: false }])).toBe(
      1,
    );
    expect(countEnabledQuoteVehicles([])).toBe(0);
  });
});
