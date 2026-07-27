import { WEEKDAYS_FULL } from "./email-to-lead.types";
import type { StagedFile } from "./email-to-lead.types";

export type CrmStructureContact = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
};

export type CrmStructureCoverageSlot = {
  /** Nombre del puesto físico / dependencia + rol (ej. "Mac Iver 541 · Guardia diurno"). */
  name: string;
  role: string | null;
  regimen: string | null;
  dias: string[];
  horaInicio: string;
  horaFin: string;
  /** Cobertura simultánea pedida por el cliente. */
  simultaneous: number;
  notes: string | null;
  /** Calculado server-side (no confiar en la IA). */
  weeklyHH: number;
  headcount: number;
  pattern: string;
  staffingRationale: string;
};

export type CrmStructureInstallation = {
  name: string;
  address: string | null;
  commune: string | null;
  city: string | null;
  mapsUrl: string | null;
  coverageSlots: CrmStructureCoverageSlot[];
};

export type CrmStructureProposal = {
  account: {
    name: string | null;
    rut: string | null;
    legalName: string | null;
    industry: string | null;
    segment: string | null;
  };
  contact: CrmStructureContact;
  deal: {
    title: string | null;
    isLicitacion: boolean;
    mesesContrato: number | null;
    notes: string | null;
    fechaLimite: string | null;
  };
  /** true si el documento define cobertura y deja la dotación al oferente. */
  coverageIsRequirementNotStaffing: boolean;
  weeklyHoursPerWorker: number;
  installations: CrmStructureInstallation[];
  openQuestions: string[];
  assumptions: string[];
  staffingTotals: {
    weeklyHH: number;
    headcountBase: number;
    reserveHeadcount: number;
    headcountWithReserve: number;
    legalMinimum: number;
  };
  requerimiento: string | null;
};

export type CrmStructureExtractionResult = {
  proposal: CrmStructureProposal;
  stagedFiles: StagedFile[];
  sources: string[];
};

export type CreateCrmStructureResult = {
  ok: boolean;
  error?: string;
  accountId?: string;
  accountUrl?: string;
  accountReused?: boolean;
  contactId?: string;
  contactUrl?: string;
  dealId?: string;
  dealUrl?: string;
  installations?: Array<{ id: string; name: string; url: string }>;
  note?: string;
};

export { WEEKDAYS_FULL };

export function emptyCrmStructureProposal(): CrmStructureProposal {
  return {
    account: { name: null, rut: null, legalName: null, industry: null, segment: null },
    contact: { firstName: null, lastName: null, email: null, phone: null, roleTitle: null },
    deal: {
      title: null,
      isLicitacion: false,
      mesesContrato: null,
      notes: null,
      fechaLimite: null,
    },
    coverageIsRequirementNotStaffing: false,
    weeklyHoursPerWorker: 42,
    installations: [],
    openQuestions: [],
    assumptions: [],
    staffingTotals: {
      weeklyHH: 0,
      headcountBase: 0,
      reserveHeadcount: 0,
      headcountWithReserve: 0,
      legalMinimum: 0,
    },
    requerimiento: null,
  };
}
