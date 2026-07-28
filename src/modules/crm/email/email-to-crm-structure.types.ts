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

/** Supuesto con identidad estable para edición inline sin IA. */
export type CrmStructureAssumption = {
  id: string;
  text: string;
  originalText: string;
  origin: "inference" | "user" | "edited";
  removed?: boolean;
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
  /** % de reserva de personal (0–100). Default tipico 15. */
  reservePct?: number;
  installations: CrmStructureInstallation[];
  openQuestions: string[];
  /** Retrocompat: lista plana de textos. Derivar de assumptionItems si existe. */
  assumptions: string[];
  /**
   * Origen de cada supuesto (índice paralelo a `assumptions`).
   * `inference` = IA; `user` = confirmado/corregido en refinamiento.
   */
  assumptionOrigins?: Array<"inference" | "user">;
  /** Supuestos con identidad (Plan v2). Fuente de verdad cuando está presente. */
  assumptionItems?: CrmStructureAssumption[];
  /** Paths JSON editados a mano; se re-aplican tras un refine con IA. */
  locks?: string[];
  staffingTotals: {
    weeklyHH: number;
    headcountBase: number;
    reserveHeadcount: number;
    headcountWithReserve: number;
    legalMinimum: number;
  };
  requerimiento: string | null;
};

/** Respuesta de refinamiento acumulada (máx. 10, answer ≤ 500). */
export type CrmStructureRefineAnswer = {
  question: string;
  answer: string;
};

export type CrmStructureExtractionResult = {
  proposal: CrmStructureProposal;
  stagedFiles: StagedFile[];
  sources: string[];
};

export type CreateCrmStructureInclude = {
  contact?: boolean;
  deal?: boolean;
  installations?: boolean;
  attachments?: boolean;
  followUpTask?: boolean;
  quote?: boolean;
  milestones?: boolean;
};

export type PlanTaskOverride = {
  title?: string;
  dueAt?: string | null;
  allDay?: boolean;
  assigneeIds?: string[];
};

export type PlanAttachmentSelection = {
  storageKeys: string[];
  target: "deal" | "account" | "both";
};

export type PlanQuoteInput = {
  name: string;
  currency: string;
  contractDuration: number;
  isOngoingService: boolean;
  validUntil: string | null;
  proposalTemplateId?: string | null;
};

export type PlanMilestone = {
  kind: "consultas" | "visita_tecnica" | "entrega";
  date: string;
  time: string;
  durationMin: number;
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string }>;
  notes?: string;
  /** Si false, el hito no se crea aunque milestones esté en include. */
  enabled?: boolean;
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
  taskId?: string;
  quoteId?: string;
  quoteUrl?: string;
  milestones?: Array<{
    kind: PlanMilestone["kind"];
    eventId: string;
    syncStatus?: string;
  }>;
  skipped?: string[];
  note?: string;
  /** Estado del sync de plazo de licitación a agenda (si aplica). */
  agendaSync?: {
    attempted: boolean;
    ok: boolean;
    skippedReason?: string;
  };
  /** Conversación anclada (Fase 2); opcional. */
  conversationId?: string;
};

/** Payload persistido en CrmEmailThread.aiPlanDraft. */
export type AiPlanDraft = {
  proposal: CrmStructureProposal;
  include: CreateCrmStructureInclude;
  locks: string[];
  taskOverride?: PlanTaskOverride;
  attachmentSelection?: PlanAttachmentSelection;
  quoteInput?: PlanQuoteInput;
  milestones?: PlanMilestone[];
  savedAt: string;
  lastMessageId?: string | null;
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
    reservePct: 10,
    installations: [],
    openQuestions: [],
    assumptions: [],
    assumptionItems: [],
    locks: [],
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

/** Deriva assumptions + assumptionOrigins desde assumptionItems (retrocompat). */
export function syncAssumptionArrays(proposal: CrmStructureProposal): CrmStructureProposal {
  const items = proposal.assumptionItems;
  if (!items) return proposal;
  const active = items.filter((a) => !a.removed);
  return {
    ...proposal,
    assumptions: active.map((a) => a.text),
    assumptionOrigins: active.map((a) =>
      a.origin === "inference" ? "inference" : "user",
    ),
  };
}
