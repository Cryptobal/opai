/**
 * Tipos compartidos del workspace de cotización (única y multi-instalación).
 */

import type { CpqQuote } from "@/types/cpq";

/** Estado del formulario de datos + condiciones comerciales de la cotización. */
export type QuoteFormState = {
  name: string;
  clientName: string;
  validUntil: string;
  notes: string;
  status: CpqQuote["status"];
  paymentTerms: string;
  serviceStartDays: number;
  contractDuration: number;
  isOngoingService: boolean;
  includedItems: string[];
  adjustmentType: string;
  adjustmentFreq: string | null;
  ipcWeight: number | null;
  imoWeight: number | null;
  insurancePolicyUF: number | null;
  contractStartDate: string | null;
  liabilityMonths: number;
  hasCCTV: boolean;
  cctvRetentionDays: number | null;
  contractTemplateId: string | null;
  paymentDays: number;
  realAnnualIncrement: number;
};

export type ProposalTemplateOption = {
  id: string;
  name: string;
  slug: string;
  description?: string;
};

/** IDs de sección para navegación (rail desktop / chips móvil). */
export const WORKSPACE_SECTIONS = [
  { id: "sec-datos", label: "Datos" },
  { id: "sec-condiciones", label: "Condiciones" },
  { id: "sec-desglose", label: "Desglose" },
  { id: "sec-puestos", label: "Puestos" },
  { id: "sec-costos", label: "Costos" },
  { id: "sec-lineas", label: "Líneas" },
  { id: "sec-financieros", label: "Financieros" },
  { id: "sec-margen", label: "Margen" },
  { id: "sec-ai", label: "Contenido AI" },
  { id: "sec-incluye", label: "Incluye" },
  { id: "sec-auditoria", label: "Auditoría" },
] as const;

export type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]["id"];
