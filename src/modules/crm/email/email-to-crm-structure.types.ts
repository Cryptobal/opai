import { WEEKDAYS_FULL } from "./email-to-lead.types";
import type { StagedFile } from "./email-to-lead.types";

export type CrmStructureContact = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  roleTitle: string | null;
  /** false = omitir al crear; default true / undefined = crear. */
  selected?: boolean;
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
  /**
   * Si true, el usuario fijó la dotación a mano: el recalc conserva `headcount`
   * y solo actualiza HH / patrón.
   */
  headcountLocked?: boolean;
  pattern: string;
  staffingRationale: string;
  /** Etapa del proyecto multi-fase (ej. "Etapa 1", "Etapa 3A"). Opcional; drafts legacy no lo traen. */
  etapa?: string | null;
  /** Vigencia del puesto YYYY-MM-DD (inclusive). null = sin vigencia. */
  vigenciaDesde?: string | null;
  vigenciaHasta?: string | null;
  /** true si el documento no declaró horas y se usó el default 08–20 / 20–08. */
  horarioAsumido?: boolean;
};

/** Peak de dotación simultánea entre vigencias (calculado en servidor). */
export type CrmStructureStaffingPeak = {
  peakHeadcount: number;
  peakWeeklyHH: number;
  peakFrom: string;
  peakTo: string;
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

/** Fechas del proceso declaradas en el pliego. YYYY-MM-DD o null. */
export type CrmStructureLicitacion = {
  fechaConsultas: string | null;
  fechaVisitaTecnica: string | null;
  fechaEntrega: string | null;
  inicioServicio: string | null;
  visitaObligatoria: boolean | null;
};

/** Piso económico impuesto por el pliego. null = no declarado. */
export type CrmStructureCondicionesEconomicas = {
  /** CLP mensual. */
  sueldoBaseMinimo: number | null;
  gratificacionPct: number | null;
  movilizacion: number | null;
  colacionProvistaPorCliente: boolean | null;
  beneficiosExigidos: string[];
  /** Montos en UF tal como declara el pliego (no convertir). */
  multas: Array<{ concepto: string; montoUf: number }>;
  kpis: Array<{ indicador: string; meta: string }>;
  /** Dotación de contingencia exigida (0–100). */
  reservaPct: number | null;
  inadmisibleSiNoCumpleRemuneracion: boolean;
};

export type CrmStructureProposal = {
  account: {
    name: string | null;
    rut: string | null;
    legalName: string | null;
    industry: string | null;
    segment: string | null;
  };
  /** Contacto primario (retrocompat); espejo de contacts[0] cuando hay lista. */
  contact: CrmStructureContact;
  /**
   * Todos los contactos candidatos (From/To/CC externos + firma/cuerpo).
   * Fuente de verdad para el plan multi-contacto; drafts viejos pueden omitirlo.
   */
  contacts?: CrmStructureContact[];
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
  /**
   * Peak de dotación simultánea por vigencias.
   * null si ningún slot tiene vigencia (drafts legacy / sin fechas).
   */
  staffingPeak?: CrmStructureStaffingPeak | null;
  requerimiento: string | null;
  /** Fechas de proceso del pliego (opcional; drafts viejos no lo traen). */
  licitacion?: CrmStructureLicitacion;
  /** Piso económico del pliego (opcional; drafts viejos no lo traen). */
  condicionesEconomicas?: CrmStructureCondicionesEconomicas;
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
  /** Evento de todo el día (oculta hora/duración en UI; rango 00:00–23:59 Chile). */
  allDay?: boolean;
  participantIds: string[];
  externalEmails: Array<{ email: string; name?: string }>;
  notes?: string;
  /** Si false, el hito no se crea aunque milestones esté en include. */
  enabled?: boolean;
  /** true cuando la fecha vino de la extracción del pliego (UI marca origen). */
  fromDocument?: boolean;
};

/** Motivo tipado de omisión al crear la estructura (Command Layer). */
export type SkipReason =
  | "no_seleccionado"
  | "requiere_negocio"
  | "sin_permiso"
  | "sin_datos"
  | "error";

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
  /** Ids omitidos (retrocompat). Preferir `skippedDetail` en UI nueva. */
  skipped?: string[];
  /** Omisiones con motivo legible. */
  skippedDetail?: Array<{ id: string; reason: SkipReason }>;
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
    contacts: [],
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
    licitacion: undefined,
    condicionesEconomicas: undefined,
  };
}

/** Semilla PlanMilestone[] desde proposal.licitacion (solo fechas no nulas). */
export function milestonesFromLicitacion(
  licitacion: CrmStructureLicitacion | undefined | null,
): PlanMilestone[] {
  if (!licitacion) return [];
  const out: PlanMilestone[] = [];
  const push = (kind: PlanMilestone["kind"], date: string | null) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    out.push({
      kind,
      date,
      time: "09:00",
      durationMin: 60,
      allDay: false,
      participantIds: [],
      externalEmails: [],
      enabled: true,
      fromDocument: true,
    });
  };
  push("consultas", licitacion.fechaConsultas);
  push("visita_tecnica", licitacion.fechaVisitaTecnica);
  push("entrega", licitacion.fechaEntrega);
  return out;
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
