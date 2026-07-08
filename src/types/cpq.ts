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
  patternWork?: number | null;
  patternOff?: number | null;
  /** Sueldo bruto sugerido (CLP) del rol/turno. */
  salary?: number | null;
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
  serviceGroupId?: string | null;
  serviceGroup?: CpqServiceGroup | null;
}

/** Patrones de cobertura del catálogo. "custom" = configurado a mano. */
export type CpqCoveragePattern =
  | "24-7"
  | "12-7-dia"
  | "12-7-noche"
  | "12-7-finde"
  | "5x2-dia"
  | "custom";

export interface CpqServiceGroup {
  id: string;
  tenantId?: string;
  quoteId: string;
  name: string;
  coveragePattern: CpqCoveragePattern;
  iconName?: string | null;
  colorHex?: string | null;
  notes?: string | null;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  positions?: CpqPosition[];
}

export type AdditionalLineType = "producto" | "servicio" | "arriendo" | "asesoria" | "equipamiento";
export type AdditionalLineRecurrence = "mensual" | "unico" | "por_evento";
export type CostItemCalcMode = "per_month" | "per_guard";
export type MarginMode = "margin_on_sale" | "markup" | "margin_on_labor";

export interface CpqQuoteAdditionalLine {
  id?: string;
  quoteId?: string;
  nombre: string;
  descripcion: string;
  precio: number;
  orden: number;
  tipo?: string;
  recurrencia?: string;
  cantidad?: number;
  marginPct?: number | null;
}

export interface AdditionalLineDetail {
  id: string;
  nombre: string;
  tipo: string;
  recurrencia: string;
  precioBase: number;
  marginPct: number;
  precioConMargen: number;
}

export interface CostByCategoryItem {
  name: string;
  amount: number;
  calcMode: string;
  technicalSpecs?: string | null;
}

export interface CostByCategory {
  category: string;
  categorySlug: string;
  categoryType: "direct" | "indirect";
  items: CostByCategoryItem[];
  subtotal: number;
}

export interface ProposalTemplateSections {
  showCoverPage: boolean;
  showCompanyIntro: boolean;
  showPositionsTable: boolean;
  showCostBreakdown: boolean;
  showCostSummaryByCategory: boolean;
  showLaborDetail: boolean;
  showEquipmentDetail: boolean;
  showVehicleDetail: boolean;
  showAdditionalServices: boolean;
  showConditions: boolean;
  showIncludedItems: boolean;
  showSignature: boolean;
  showComplianceSection: boolean;
  showTechnicalSpecs: boolean;
  numberedSections: boolean;
  headerStyle: "standard" | "detailed" | "formal";
}

export interface CpqQuote {
  id: string;
  tenantId: string;
  code: string;
  name?: string | null;
  status: CpqQuoteStatus;
  /** null = legado (visible en portal si no es borrador); true/false = forzar */
  visibleInClientPortal?: boolean | null;
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
  /** Commercial conditions */
  paymentTerms?: string;
  serviceStartDays?: number;
  contractDuration?: number;
  /** true = servicio continuo/indefinido (default); false = plazo definido (termina a los contractDuration meses) */
  isOngoingService?: boolean;
  includedItems?: string[];
  /** Proposal template */
  proposalTemplateId?: string | null;
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
  defaultTechnicalSpecs?: string | null;
  priceLogic?: string;
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
  marginMode?: MarginMode;
}

export interface CpqQuoteUniformItem {
  id?: string;
  quoteId?: string;
  catalogItemId: string;
  unitPriceOverride?: number | null;
  technicalSpecs?: string | null;
  priceLogic?: string;
  active: boolean;
  catalogItem?: CpqCatalogItem;
}

export interface CpqQuoteExamItem {
  id?: string;
  quoteId?: string;
  catalogItemId: string;
  unitPriceOverride?: number | null;
  technicalSpecs?: string | null;
  active: boolean;
  catalogItem?: CpqCatalogItem;
}

export interface CpqQuoteCostItem {
  id?: string;
  quoteId?: string;
  catalogItemId?: string | null;
  customName?: string | null;
  customType?: string | null;
  customCategory?: string | null;
  calcMode: string;
  quantity: number;
  unitPriceOverride?: number | null;
  isEnabled: boolean;
  visibility: string;
  notes?: string | null;
  technicalSpecs?: string | null;
  catalogItem?: CpqCatalogItem;
}

export interface CpqQuoteMeal {
  id?: string;
  quoteId?: string;
  mealType: string;
  mealsPerDay: number;
  daysOfService: number;
  priceOverride?: number | null;
  technicalSpecs?: string | null;
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
  costsBase: number;
  baseWithMargin: number;
  monthlyFinancial: number;
  monthlyPolicy: number;
  monthlyExtras: number;
  monthlyTotal: number;
  financialRatePct?: number;
  policyRatePct?: number;
  additionalLinesDetails: AdditionalLineDetail[];
  additionalLinesTotalBase: number;
  additionalLinesTotalWithMargin: number;
  costsByCategory: CostByCategory[];
  marginMode: string;
  laborCost: number;
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
