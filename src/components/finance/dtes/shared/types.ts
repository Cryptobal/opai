/**
 * Tipos compartidos del módulo DTEs Emitidos.
 *
 * Extraídos de FacturacionClient.tsx (monolito original) para que múltiples
 * componentes (tabla, mobile list, slide-over, orquestador) los reutilicen
 * sin duplicar.
 */

export interface DteRow {
  id: string;
  dteType: number;
  folio: number;
  receiverRut: string;
  receiverName: string;
  receiverEmail: string | null;
  /** Copias al enviar la factura por correo (mismo DTE). */
  receiverEmailCc?: string[];
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  siiStatus: string;
  currency: string;
  linesCount: number;
  createdAt: string;
  emailSentAt: string | null;
  emailStatus: string | null;
  referenceType: number | null;
  referenceFolio: number | null;
  /** False para DTEs importados de CSV/RCV (no tienen XML local). */
  hasXml?: boolean;
  /** Centro de costo: cliente CRM + instalación. */
  crmAccountId?: string | null;
  installationId?: string | null;
  crmAccount?: { id: string; name: string; legalName: string | null } | null;
  installation?: { id: string; name: string; commune: string | null } | null;
  /** Factoring: indica si el DTE puede ser cedido (33/34/43/46 + ACCEPTED + XML + sin cesión activa). */
  canBeCeded?: boolean;
  /** Cesión activa asociada al DTE (si existe). */
  activeCession?: { id: string; code: string; status: string } | null;
  /** Fecha tributaria del DTE (para aging y filtros). */
  date?: string;
  /** Vencimiento (opcional). */
  dueDate?: string | null;
  /** Estado de pago (UNPAID / PARTIAL / PAID / OVERDUE / WRITTEN_OFF). */
  paymentStatus?: string | null;
  /**
   * Última conciliación con cartola bancaria (post 2026-05). Si hay
   * un FinancePaymentRecord asociado al DTE, este campo trae info del
   * recibo y del movimiento bancario que lo originó (si vino del flujo
   * manual de "Conciliar movimiento") para mostrar tooltip "Conciliado
   * el {fecha} con mov. {ref}". Null si nunca se conció con cartola
   * (ya sea porque está UNPAID o porque se marcó pagado vía
   * bulk-mark-paid sin asociar mov. bancario).
   */
  lastReconciliation?: {
    paymentId: string;
    paymentCode: string;
    paymentDate: string;
    paymentStatus: string;
    bankTransactionId: string | null;
    bankTransactionDate: string | null;
    bankTransactionReference: string | null;
    bankTransactionDescription: string | null;
  } | null;
  /**
   * NCs vivas que referencian a este DTE. Si hay al menos una, la lista
   * pinta un badge "Con NC" (rojo si es anulación total, ámbar si es
   * corrección parcial). Null = no tiene NCs asociadas.
   */
  linkedCreditNote?: {
    count: number;
    hasFullAnnulment: boolean;
    creditedNet: number;
    primaryFolio: number;
  } | null;
}

export type CostCenterOption = { id: string; name: string; legalName: string | null };
export type InstallationOption = { id: string; name: string; commune: string | null };

export type DteSortKey =
  | "date_desc"
  | "date_asc"
  | "created_desc"
  | "created_asc"
  | "total_desc"
  | "total_asc";

/** Filtros aplicados a la lista de DTEs Emitidos. Persistidos en URL. */
export interface DteFilters {
  search: string;
  types: number[];                // multi-select por dteType
  siiStatuses: string[];          // multi-select por siiStatus
  paymentStatuses: string[];      // UNPAID | PARTIAL | OVERDUE | PAID
  periodo: string;                // "ALL" | "CURRENT_MONTH" | "YYYY-MM"
  accountId: string;              // "ALL" | "NONE" | uuid
  installationId: string;         // "ALL" | "NONE" | uuid
  amountMin: number | null;
  amountMax: number | null;
  onlyCeded: boolean;
  onlyWithCreditNotes: boolean;
  onlyEmailFailed: boolean;
  excludeDrafts: boolean;
  sort: DteSortKey;
}

export const EMPTY_DTE_FILTERS: DteFilters = {
  search: "",
  types: [],
  siiStatuses: [],
  paymentStatuses: [],
  periodo: "CURRENT_MONTH",
  accountId: "ALL",
  installationId: "ALL",
  amountMin: null,
  amountMax: null,
  onlyCeded: false,
  onlyWithCreditNotes: false,
  onlyEmailFailed: false,
  excludeDrafts: false,
  sort: "date_desc",
};
