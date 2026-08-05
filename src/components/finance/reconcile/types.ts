export type LocalLinkType =
  | "DTE_ISSUED"
  | "DTE_RECEIVED"
  | "EXPENSE"
  | "INCOME"
  | "FACTORING_OPERATION";

export interface LocalLink {
  key: string;
  targetType: LocalLinkType;
  targetId: string | null;
  amount: number;
  accountPlanId: string | null;
  note: string | null;
  label: string;
  /** Folio DTE si aplica (estado local UI; no se serializa al API). */
  folio?: number | null;
  /** Etiqueta corta para chips (folio o código de cesión). */
  shortLabel?: string;
}

export interface FactoringCandidate {
  id: string;
  code: string;
  factoringCompanyName: string;
  factoringCompanyId?: string | null;
  fechaCesion: string;
  fechaVencimiento: string;
  invoiceAmount: number;
  expectedDeposit: number;
  expectedDepositSource: "simulation" | "computed";
  status: string;
  dteFolio: number | null;
  dteReceiverName: string | null;
  /** Fecha de emisión del DTE (ISO), si existe. */
  dteIssuedAt?: string | null;
  installationName: string | null;
  confidence: number;
  matchSignals: string[];
  isSuggested: boolean;
  batchId?: string | null;
  batchCode?: string | null;
  batchTotalMontoAGirar?: number | null;
  batchOperationsCount?: number | null;
}

export interface FactoringBatchCandidate {
  id: string;
  code: string;
  factoringCompanyName: string;
  fechaCesion: string;
  operationsCount: number;
  totalMontoAGirar: number;
  totalSource: "batch" | "sum_sim" | "sum_net";
  matchesDeposit: boolean;
  operationIds: string[];
}

export interface DteCandidate {
  id: string;
  direction: "ISSUED" | "RECEIVED";
  documentType: string;
  dteType: number;
  folio: number | null;
  issuerName: string;
  receiverName: string;
  receiverRut: string | null;
  issuerRut: string | null;
  total: number;
  amountPaid: number;
  amountPending: number;
  issuedAt: string;
  paymentStatus: string;
  installationName: string | null;
}

export type SearchScope = "factoring" | "ceded" | "open" | "all";

export type AllocationRailStatus = "falta" | "excede" | "calza" | "vacio";

export type FooterState = "empty" | "diff" | "ready";
