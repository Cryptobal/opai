/**
 * Costo mensual de extras `kind=vehicle` (`CpqQuoteVehicle`).
 * Misma fórmula que `computeCpqQuoteCosts` → `monthlyVehicles`:
 * (arriendo + combustible + mantención) × cantidad.
 * No usa costItems de catálogo ni extras de nombre libre.
 */

export type QuoteVehicleCostInput = {
  id?: string;
  vehiclesCount?: number | null;
  rentMonthly?: unknown;
  kmPerDay?: unknown;
  daysPerMonth?: unknown;
  kmPerLiter?: unknown;
  fuelPrice?: unknown;
  maintenanceMonthly?: unknown;
  isEnabled?: boolean | null;
};

export type QuoteVehiclePartKey = "rent" | "fuel" | "maintenance";

export type QuoteVehiclePart = {
  key: QuoteVehiclePartKey;
  label: string;
  amount: number;
};

export type QuoteVehicleBreakdown = {
  id?: string;
  label: string;
  vehiclesCount: number;
  rent: number;
  fuel: number;
  maintenance: number;
  total: number;
  parts: QuoteVehiclePart[];
};

const PART_LABEL: Record<QuoteVehiclePartKey, string> = {
  rent: "Arriendo",
  fuel: "Combustible",
  maintenance: "Mantención",
};

function num(value: unknown): number {
  return Number(value || 0);
}

/** Combustible mensual de una unidad: (km/día × días/mes ÷ km/l) × precio. */
export function computeQuoteVehicleFuelMonthly(vehicle: QuoteVehicleCostInput): number {
  const kmPerDay = num(vehicle.kmPerDay);
  const daysPerMonth = num(vehicle.daysPerMonth);
  const kmPerLiter = num(vehicle.kmPerLiter);
  const liters = kmPerLiter > 0 ? (kmPerDay * daysPerMonth) / kmPerLiter : 0;
  return liters * num(vehicle.fuelPrice);
}

export function computeQuoteVehicleBreakdown(
  vehicle: QuoteVehicleCostInput,
  index = 0,
): QuoteVehicleBreakdown {
  const vehiclesCount = num(vehicle.vehiclesCount);
  const rentUnit = num(vehicle.rentMonthly);
  const fuelUnit = computeQuoteVehicleFuelMonthly(vehicle);
  const maintenanceUnit = num(vehicle.maintenanceMonthly);
  const rent = rentUnit * vehiclesCount;
  const fuel = fuelUnit * vehiclesCount;
  const maintenance = maintenanceUnit * vehiclesCount;
  const parts: QuoteVehiclePart[] = [
    { key: "rent", label: PART_LABEL.rent, amount: rent },
    { key: "fuel", label: PART_LABEL.fuel, amount: fuel },
    { key: "maintenance", label: PART_LABEL.maintenance, amount: maintenance },
  ];
  const countLabel = vehiclesCount > 1 ? ` × ${vehiclesCount}` : "";
  return {
    id: vehicle.id,
    label: `Vehículo ${index + 1}${countLabel}`,
    vehiclesCount,
    rent,
    fuel,
    maintenance,
    total: rent + fuel + maintenance,
    parts,
  };
}

export function listEnabledQuoteVehicleBreakdowns(
  vehicles: QuoteVehicleCostInput[],
): QuoteVehicleBreakdown[] {
  const enabled = vehicles.filter((vehicle) => vehicle.isEnabled);
  return enabled.map((vehicle, index) => computeQuoteVehicleBreakdown(vehicle, index));
}

/** Suma mensual de extras vehicle habilitados. Extra ausente o disabled → 0. */
export function sumEnabledQuoteVehiclesMonthly(vehicles: QuoteVehicleCostInput[]): number {
  return listEnabledQuoteVehicleBreakdowns(vehicles).reduce((sum, row) => sum + row.total, 0);
}

/**
 * Total de la fila Vehículos en Costos adicionales.
 * Extras kind=vehicle + total de costItems tipados vehicle_rent/fuel/tag (legado).
 * El caller no debe pasar extras de nombre libre (Camioneta/Bencina).
 */
export function additionalCostsVehicleRowTotal(
  vehicles: QuoteVehicleCostInput[],
  catalogTypedVehicleTotal = 0,
): number {
  return sumEnabledQuoteVehiclesMonthly(vehicles) + num(catalogTypedVehicleTotal);
}

/** Cantidad de unidades de extras vehicle habilitados (para el badge de la fila). */
export function countEnabledQuoteVehicles(vehicles: QuoteVehicleCostInput[]): number {
  return listEnabledQuoteVehicleBreakdowns(vehicles).reduce(
    (sum, row) => sum + row.vehiclesCount,
    0,
  );
}
