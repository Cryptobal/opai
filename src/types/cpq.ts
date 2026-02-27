/**
 * Tipos CPQ (Configure, Price, Quote)
 */

export type CpqQuoteStatus = "draft" | "sent" | "approved" | "rejected";

export interface CpqCargo {
  id: string;
  name: string;
  description?: string | null;
  colorHex?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CpqRol {
  id: string;
  name: string;
  description?: string | null;
  colorHex?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CpqPuestoTrabajo {
  id: string;
  name: string;
  colorHex?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CpqPosition {
  id: string;
  quoteId: string;
  puestoTrabajoId: string;
  customName?: string | null;
  description?: string | null;
  weekdays: string[];
  startTime: string;
  endTime: string;
  numGuards: number;
  numPuestos: number;
  cargoId: string;
  rolId: string;
  baseSalary: number;
  afpName: string;
  healthSystem: string;
  healthPlanPct?: number | null;
  employerCost: number;
  netSalary?: number | null;
  monthlyPositionCost: number;
  payrollSnapshot?: any;
  payrollVersionId?: string | null;
  calculatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  puestoTrabajo?: CpqPuestoTrabajo;
  cargo?: CpqCargo;
  rol?: CpqRol;
}

export interface CpqQuote {
  id: string;
  tenantId: string;
  code: string;
  name?: string | null;
  status: CpqQuoteStatus;
  clientName?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  totalPositions: number;
  totalGuards: number;
  monthlyCost: number;
  createdAt: string;
  updatedAt: string;
  positions?: CpqPosition[];
  /** CRM link */
  accountId?: string | null;
  installationId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  currency?: string;
  /** AI-generated description */
  aiDescription?: string | null;
  /** AI-generated service detail for proposal */
  serviceDetail?: string | null;
}

export interface CpqCatalogItem {
  id: string;
  tenantId?: string | null;
  type: string;
  name: string;
  unit: string;
  basePrice: number;
  isDefault?: boolean;
  defaultVisibility: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CpqQuoteParameters {
  id?: string;
  quoteId?: string;
  monthlyHoursStandard: number;
  avgStayMonths: number;
  uniformChangesPerYear: number;
  holidayAnnualCount?: number;
  holidayCommercialBufferPct?: number;
  financialEnabled?: boolean;
  financialRatePct: number;
  salePriceBase?: number;
  salePriceMonthly: number;
  policyEnabled?: boolean;
  policyRatePct: number;
  policyAdminRatePct: number;
  policyContractMonths: number;
  policyContractPct: number;
  contractMonths: number;
  contractAmount: number;
  marginPct: number;
}

export interface CpqQuoteUniformItem {
  id?: string;
  quoteId?: string;
  catalogItemId: string;
  unitPriceOverride?: number | null;
  active: boolean;
  catalogItem?: CpqCatalogItem;
}

export interface CpqQuoteExamItem {
  id?: string;
  quoteId?: string;
  catalogItemId: string;
  unitPriceOverride?: number | null;
  active: boolean;
  catalogItem?: CpqCatalogItem;
}

export interface CpqQuoteCostItem {
  id?: string;
  quoteId?: string;
  catalogItemId: string;
  calcMode: string;
  quantity: number;
  unitPriceOverride?: number | null;
  isEnabled: boolean;
  visibility: string;
  notes?: string | null;
  catalogItem?: CpqCatalogItem;
}

export interface CpqQuoteMeal {
  id?: string;
  quoteId?: string;
  mealType: string;
  mealsPerDay: number;
  daysOfService: number;
  priceOverride?: number | null;
  isEnabled: boolean;
  visibility: string;
}

export interface CpqQuoteVehicle {
  id?: string;
  quoteId?: string;
  vehiclesCount: number;
  rentMonthly: number;
  kmPerDay: number;
  daysPerMonth: number;
  kmPerLiter: number;
  fuelPrice: number;
  maintenanceMonthly: number;
  isEnabled: boolean;
  visibility: string;
}

export interface CpqQuoteInfrastructure {
  id?: string;
  quoteId?: string;
  itemType: string;
  quantity: number;
  rentMonthly: number;
  hasFuel: boolean;
  fuelLitersPerHour: number;
  fuelHoursPerDay: number;
  fuelDaysPerMonth: number;
  fuelPrice: number;
  isEnabled: boolean;
  visibility: string;
}

export interface CpqQuoteCostSummary {
  totalGuards: number;
  monthlyPositions: number;
  monthlyHolidayAdjustment: number;
  monthlyUniforms: number;
  monthlyExams: number;
  monthlyMeals: number;
  monthlyVehicles: number;
  monthlyInfrastructure: number;
  monthlyCostItems: number;
  monthlyFinancial: number;
  monthlyPolicy: number;
  monthlyExtras: number;
  monthlyTotal: number;
  financialRatePct?: number;
  policyRatePct?: number;
}

export interface CreateQuoteInput {
  clientName?: string;
  validUntil?: string;
  notes?: string;
}

export interface UpdateQuoteInput {
  status?: CpqQuoteStatus;
  clientName?: string;
  validUntil?: string;
  notes?: string;
}

export interface CreatePositionInput {
  puestoTrabajoId: string;
  customName?: string;
  description?: string;
  weekdays: string[];
  startTime: string;
  endTime: string;
  numGuards: number;
  numPuestos: number;
  cargoId: string;
  rolId: string;
  baseSalary: number;
  afpName?: string;
  healthSystem?: string;
  healthPlanPct?: number | null;
}

export interface UpdatePositionInput extends Partial<CreatePositionInput> {}

export interface QuoteDetailResponse {
  quote: CpqQuote;
  positions: CpqPosition[];
}
