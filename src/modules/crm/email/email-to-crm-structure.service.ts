import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import {
  DOC_TEXT_MAX_TOTAL,
  truncateDocText,
} from "@/lib/ai/document-text-budget";
import {
  computePeakStaffing,
  staffingForCoverageSlot,
  sumStaffing,
  normalizeWeekdays,
  shiftHours,
} from "@/lib/crm/coverage-to-staffing";
import { UNTRUSTED_RULES, wrapUntrusted } from "./ai-untrusted";
import { htmlToTextWithTables, stripHtml } from "./email-text-util";
import { gmailClientForAccount } from "./gmail-account-client";
import { prepareThreadAttachments, type PreparedAttachments } from "./email-to-lead-attachments";
import { WEEKDAYS_FULL } from "./email-to-lead.types";
import {
  emptyCrmStructureProposal,
  syncAssumptionArrays,
  type CrmStructureAssumption,
  type CrmStructureCondicionesEconomicas,
  type CrmStructureCoverageSlot,
  type CrmStructureExtractionResult,
  type CrmStructureInstallation,
  type CrmStructureLicitacion,
  type CrmStructureProposal,
  type CrmStructureRefineAnswer,
} from "./email-to-crm-structure.types";

/** Hash corto estable para ids de supuestos. */
function shortHash(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).slice(0, 6);
}

export function buildAssumptionItems(
  assumptions: string[],
  origins?: Array<"inference" | "user">,
  existing?: CrmStructureAssumption[],
): CrmStructureAssumption[] {
  if (Array.isArray(existing) && existing.length > 0) {
    return existing.map((a, i) => ({
      id: a.id || `a-${i}-${shortHash(a.text || a.originalText || "")}`,
      text: a.text,
      originalText: a.originalText || a.text,
      origin: a.origin === "user" || a.origin === "edited" ? a.origin : "inference",
      removed: a.removed === true ? true : undefined,
    }));
  }
  return assumptions.map((text, i) => ({
    id: `a-${i}-${shortHash(text)}`,
    text,
    originalText: text,
    origin: origins?.[i] === "user" ? "user" : "inference",
  }));
}

const SYSTEM = `Eres un asistente comercial de una empresa de seguridad privada en Chile.
Extraes del correo + adjuntos (RFI, bases, SoW, consulta al mercado, pliego) la ESTRUCTURA CRM + COBERTURA + HITOS + CONDICIONES ECONÓMICAS para proponer alta en OPAI.

Devuelve SOLO un objeto JSON con EXACTAMENTE estas claves:
{
  "account": { "name": string|null, "rut": string|null, "legalName": string|null, "industry": string|null, "segment": string|null },
  "contact": { "firstName": string|null, "lastName": string|null, "email": string|null, "phone": string|null, "roleTitle": string|null },
  "deal": { "title": string|null, "isLicitacion": boolean, "mesesContrato": number|null, "notes": string|null, "fechaLimite": string|null },
  "coverageIsRequirementNotStaffing": boolean,
  "weeklyHoursPerWorker": number,
  "reservePct": number,
  "requerimiento": string|null,
  "licitacion": {
    "fechaConsultas": "YYYY-MM-DD"|null,
    "fechaVisitaTecnica": "YYYY-MM-DD"|null,
    "fechaEntrega": "YYYY-MM-DD"|null,
    "inicioServicio": "YYYY-MM-DD"|null,
    "visitaObligatoria": boolean|null
  },
  "condicionesEconomicas": {
    "sueldoBaseMinimo": number|null,
    "gratificacionPct": number|null,
    "movilizacion": number|null,
    "colacionProvistaPorCliente": boolean|null,
    "beneficiosExigidos": string[],
    "multas": [{ "concepto": string, "montoUf": number }],
    "kpis": [{ "indicador": string, "meta": string }],
    "reservaPct": number|null,
    "inadmisibleSiNoCumpleRemuneracion": boolean
  },
  "installations": [
    {
      "name": string,
      "address": string|null,
      "commune": string|null,
      "city": string|null,
      "mapsUrl": string|null,
      "coverageSlots": [
        {
          "name": string,
          "role": string|null,
          "regimen": string|null,
          "dias": string[],
          "horaInicio": string,
          "horaFin": string,
          "simultaneous": number,
          "notes": string|null,
          "etapa": string|null,
          "vigenciaDesde": "YYYY-MM-DD"|null,
          "vigenciaHasta": "YYYY-MM-DD"|null,
          "horarioAsumido": boolean
        }
      ]
    }
  ],
  "openQuestions": string[],
  "assumptions": string[]
}

Reglas CRÍTICAS:
1. COBERTURA ≠ DOTACIÓN. Si el documento dice que el cuadro es de cobertura y la dotación la define el oferente (típico RFI/consulta al mercado), pon coverageIsRequirementNotStaffing=true. En "simultaneous" pon la cobertura pedida (personas en terreno a la vez), NUNCA inventes headcount.
2. MULTI-INSTALACIÓN: una instalación por dependencia/dirección distinta. Si hay varios pisos del MISMO edificio, puedes agruparlos en UNA instalación con varios coverageSlots (nombre del slot = piso/rol). Sitios en otra calle = instalación separada.
3. Para sitios 24/7 emite DOS slots (diurno y nocturno) con su simultaneous respectivo; regimen="24/7".
4. dias en minúsculas sin acento: lunes…domingo. horaInicio/horaFin en HH:mm 24h.
5. weeklyHoursPerWorker: 42 si el documento lo indica (Ley 40 horas / jornada referencial); si no, 42.
6. isLicitacion true si es licitación, bases, Wherex, Mercado Público o Consulta al Mercado / RFI.
7. openQuestions: ambigüedades caras (ej. jefe de turno adicional, colación, jornada parcial) y datos relevantes que el documento NO declare (fechas, sueldo mínimo, multas). Máx 8.
8. assumptions: supuestos razonables que aplicaste. Máx 5.
9. No inventes RUT, montos, fechas ni emails. Si no está en el documento → null y, si es relevante, openQuestions. Si el contacto solo trae teléfono, email puede ser null.
10. Extrae TODOS los slots del cuadro de cobertura; no resumas "9 dependencias" en un solo slot genérico.
11. licitacion: fechas del cronograma del pliego normalizadas a YYYY-MM-DD. Fechas textuales chilenas ("10 de agosto de 2026") → ISO. Ante ambigüedad → null + openQuestions. deal.fechaLimite debe coincidir con licitacion.fechaEntrega cuando exista.
12. condicionesEconomicas: piso salarial (sueldoBaseMinimo en CLP mensual), asignaciones, multas en UF (NO convertir a CLP), KPI contractuales. inadmisibleSiNoCumpleRemuneracion=true si el pliego declara inadmisibilidad por incumplimiento remuneracional. Si declara % de dotación de contingencia, ponelo en condicionesEconomicas.reservaPct Y en reservePct raíz.
13. Si un dato aparece dos veces con valores distintos, NO elijas uno: null + conflicto en openQuestions.
14. Si el documento trae una tabla frente/etapa/período/cobertura, emite los slots mapeando CADA fila 1:1; nunca cruces valores entre filas; conserva el nombre de etapa en \`etapa\` y el período en vigenciaDesde/vigenciaHasta (ISO).
15. Si el documento no declara horas de los turnos, usa 08:00–20:00 (día) y 20:00–08:00 (noche), marca \`horarioAsumido: true\` y agrégalo a assumptions.
16. Rondín/rondas nocturnas: slot con regimen "Rondín" y detalle en notes; no lo conviertas en puesto fijo.
17. Si la cobertura dice "por frente" y el frente agrupa varios puntos, no multipliques: usa el valor literal y agrega la ambigüedad a openQuestions.`;

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
function bool(v: unknown): boolean {
  return v === true || v === "true";
}

/** YYYY-MM-DD estricto; descarta silenciosamente lo inválido. */
function ymd(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return s;
}

function nullableBool(v: unknown): boolean | null {
  if (v === true || v === "true") return true;
  if (v === false || v === "false") return false;
  return null;
}

/** Número finito positivo (montos); null si inválido o ≤0. */
function positiveNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeLicitacion(raw: unknown): CrmStructureLicitacion | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const fechaConsultas = ymd(r.fechaConsultas);
  const fechaVisitaTecnica = ymd(r.fechaVisitaTecnica);
  const fechaEntrega = ymd(r.fechaEntrega);
  const inicioServicio = ymd(r.inicioServicio);
  if (!fechaConsultas && !fechaVisitaTecnica && !fechaEntrega && !inicioServicio) {
    const visita = nullableBool(r.visitaObligatoria);
    if (visita === null) return undefined;
  }
  // Coherencia blanda: si entrega < consultas, descartar entrega (no inventar).
  let entrega = fechaEntrega;
  if (fechaConsultas && entrega && entrega < fechaConsultas) entrega = null;
  let visita = fechaVisitaTecnica;
  if (entrega && visita && visita > entrega) {
    // Visita después de entrega es incoherente en licitaciones típicas.
    visita = null;
  }
  return {
    fechaConsultas,
    fechaVisitaTecnica: visita,
    fechaEntrega: entrega,
    inicioServicio,
    visitaObligatoria: nullableBool(r.visitaObligatoria),
  };
}

function normalizeCondicionesEconomicas(
  raw: unknown,
): CrmStructureCondicionesEconomicas | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;

  const beneficiosExigidos = Array.isArray(r.beneficiosExigidos)
    ? r.beneficiosExigidos
        .filter((x): x is string => typeof x === "string" && !!x.trim())
        .map((x) => x.trim().slice(0, 200))
        .slice(0, 15)
    : [];

  const multas = Array.isArray(r.multas)
    ? r.multas
        .map((m) => {
          if (!m || typeof m !== "object") return null;
          const row = m as Record<string, unknown>;
          const concepto = str(row.concepto);
          const montoUf = positiveNum(row.montoUf);
          if (!concepto || montoUf == null) return null;
          return { concepto: concepto.slice(0, 200), montoUf };
        })
        .filter((x): x is { concepto: string; montoUf: number } => !!x)
        .slice(0, 20)
    : [];

  const kpis = Array.isArray(r.kpis)
    ? r.kpis
        .map((k) => {
          if (!k || typeof k !== "object") return null;
          const row = k as Record<string, unknown>;
          const indicador = str(row.indicador);
          const meta = str(row.meta);
          if (!indicador || !meta) return null;
          return { indicador: indicador.slice(0, 200), meta: meta.slice(0, 200) };
        })
        .filter((x): x is { indicador: string; meta: string } => !!x)
        .slice(0, 15)
    : [];

  const reservaRaw = Number(r.reservaPct);
  const reservaPct =
    Number.isFinite(reservaRaw) && reservaRaw >= 0 && reservaRaw <= 100
      ? Math.round(reservaRaw)
      : null;

  const sueldoBaseMinimo = positiveNum(r.sueldoBaseMinimo);
  const gratificacionPct = (() => {
    const n = Number(r.gratificacionPct);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
  })();
  const movilizacion = positiveNum(r.movilizacion);

  const hasAny =
    sueldoBaseMinimo != null ||
    gratificacionPct != null ||
    movilizacion != null ||
    nullableBool(r.colacionProvistaPorCliente) != null ||
    beneficiosExigidos.length > 0 ||
    multas.length > 0 ||
    kpis.length > 0 ||
    reservaPct != null ||
    r.inadmisibleSiNoCumpleRemuneracion === true;

  if (!hasAny) return undefined;

  return {
    sueldoBaseMinimo: sueldoBaseMinimo != null ? Math.round(sueldoBaseMinimo) : null,
    gratificacionPct,
    movilizacion: movilizacion != null ? Math.round(movilizacion) : null,
    colacionProvistaPorCliente: nullableBool(r.colacionProvistaPorCliente),
    beneficiosExigidos,
    multas,
    kpis,
    reservaPct,
    inadmisibleSiNoCumpleRemuneracion: bool(r.inadmisibleSiNoCumpleRemuneracion),
  };
}

function splitName(nombre: string | null): { firstName: string | null; lastName: string | null } {
  if (!nombre) return { firstName: null, lastName: null };
  const parts = nombre.trim().split(/\s+/);
  return parts.length === 1
    ? { firstName: parts[0], lastName: null }
    : { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function normalizeTime(v: unknown, fallback: string): string {
  if (typeof v !== "string" || !v.trim()) return fallback;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function enrichSlot(raw: Record<string, unknown>, weeklyHours: number): CrmStructureCoverageSlot | null {
  const name = str(raw.name) ?? str(raw.nombre);
  if (!name) return null;
  const rawDias = Array.isArray(raw.dias) ? raw.dias.map(String) : [...WEEKDAYS_FULL];
  const dias = normalizeWeekdays(rawDias);
  // Preservar marcador de festivos (no forma parte del cálculo HH).
  const hasFestivo = rawDias.some((d) => {
    const k = d.trim().toLowerCase();
    return k === "festivo" || k === "fer" || k === "f" || k === "feriado";
  });
  const diasWithFestivo = hasFestivo ? [...dias, "festivo"] : dias;
  const horaInicio = normalizeTime(raw.horaInicio, "08:00");
  const horaFin = normalizeTime(raw.horaFin, "20:00");
  const simultaneous = Math.max(1, num(raw.simultaneous) ?? num(raw.cobertura) ?? num(raw.numPuestos) ?? 1);
  const regimen = str(raw.regimen);
  const staff = staffingForCoverageSlot(
    { simultaneous, dias, horaInicio, horaFin, regimen },
    weeklyHours,
  );
  const headcountLocked = Boolean(raw.headcountLocked);
  const manualHeadcount = num(raw.headcount);
  const headcount =
    headcountLocked && manualHeadcount != null && manualHeadcount > 0
      ? Math.max(1, Math.floor(manualHeadcount))
      : staff.headcount;
  const etapa = str(raw.etapa);
  const vigenciaDesde = ymd(raw.vigenciaDesde);
  const vigenciaHasta = ymd(raw.vigenciaHasta);
  const horarioAsumido = bool(raw.horarioAsumido);
  return {
    name,
    role: str(raw.role) ?? str(raw.rol),
    regimen,
    dias: diasWithFestivo.length ? diasWithFestivo : [...WEEKDAYS_FULL],
    horaInicio,
    horaFin,
    simultaneous,
    notes: str(raw.notes),
    weeklyHH: staff.weeklyHH,
    headcount,
    ...(headcountLocked ? { headcountLocked: true } : {}),
    pattern: staff.pattern,
    staffingRationale: staff.rationale,
    ...(etapa ? { etapa } : { etapa: null }),
    vigenciaDesde,
    vigenciaHasta,
    ...(horarioAsumido ? { horarioAsumido: true } : {}),
  };
}

function enrichInstallation(raw: unknown, weeklyHours: number): CrmStructureInstallation | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = str(r.name) ?? str(r.nombre);
  if (!name) return null;
  const slotsRaw = Array.isArray(r.coverageSlots) ? r.coverageSlots : Array.isArray(r.puestos) ? r.puestos : [];
  const coverageSlots = slotsRaw
    .map((s) => (s && typeof s === "object" ? enrichSlot(s as Record<string, unknown>, weeklyHours) : null))
    .filter((s): s is CrmStructureCoverageSlot => !!s);
  return {
    name,
    address: str(r.address) ?? str(r.direccion),
    commune: str(r.commune) ?? str(r.comuna),
    city: str(r.city) ?? str(r.ciudad),
    mapsUrl: str(r.mapsUrl),
    coverageSlots,
  };
}

/** Normaliza JSON de IA + calcula dotación (exportado para tests). */
export function normalizeCrmStructureProposal(raw: Record<string, unknown>): CrmStructureProposal {
  const base = emptyCrmStructureProposal();
  const accountRaw = (raw.account ?? {}) as Record<string, unknown>;
  const contactRaw = (raw.contact ?? {}) as Record<string, unknown>;
  const dealRaw = (raw.deal ?? {}) as Record<string, unknown>;

  let firstName = str(contactRaw.firstName);
  let lastName = str(contactRaw.lastName);
  if (!firstName && str(contactRaw.nombre)) {
    const split = splitName(str(contactRaw.nombre));
    firstName = split.firstName;
    lastName = split.lastName;
  }

  const weeklyHours = num(raw.weeklyHoursPerWorker) ?? 42;
  const licitacion = normalizeLicitacion(raw.licitacion);
  const condicionesEconomicas = normalizeCondicionesEconomicas(raw.condicionesEconomicas);
  // reservePct en propuesta = porcentaje 0–100; sumStaffing espera fracción 0–1.
  // Preferir el % de contingencia del pliego si el documento lo declara.
  const reservePctRaw = Number(raw.reservePct);
  const reserveFromDoc = condicionesEconomicas?.reservaPct;
  const reservePct =
    reserveFromDoc != null
      ? reserveFromDoc
      : Number.isFinite(reservePctRaw) && reservePctRaw >= 0 && reservePctRaw <= 100
        ? Math.round(reservePctRaw)
        : 10;
  const installations = (Array.isArray(raw.installations) ? raw.installations : [])
    .map((i) => enrichInstallation(i, weeklyHours))
    .filter((i): i is CrmStructureInstallation => !!i);

  // Fallback: una sola instalación genérica si la IA no desglosó sitios pero sí puestos planos.
  if (installations.length === 0 && Array.isArray(raw.coverageSlots)) {
    const slots = raw.coverageSlots
      .map((s) => (s && typeof s === "object" ? enrichSlot(s as Record<string, unknown>, weeklyHours) : null))
      .filter((s): s is CrmStructureCoverageSlot => !!s);
    if (slots.length > 0) {
      installations.push({
        name: str(accountRaw.name) ? `${str(accountRaw.name)} — Sitio principal` : "Instalación principal",
        address: null,
        commune: null,
        city: null,
        mapsUrl: null,
        coverageSlots: slots,
      });
    }
  }

  const allStaff = installations.flatMap((i) =>
    i.coverageSlots.map((s) => ({
      weeklyHH: s.weeklyHH,
      headcount: s.headcount,
      pattern: s.pattern as "4x4" | "pool_42h" | "parcial",
      rationale: s.staffingRationale,
    })),
  );
  const totals = sumStaffing(allStaff, weeklyHours, reservePct / 100);
  const staffingPeak = computePeakStaffing(
    installations.flatMap((i) =>
      i.coverageSlots.map((s) => ({
        headcount: s.headcount,
        weeklyHH: s.weeklyHH,
        vigenciaDesde: s.vigenciaDesde,
        vigenciaHasta: s.vigenciaHasta,
      })),
    ),
  );

  const openQuestions = Array.isArray(raw.openQuestions)
    ? raw.openQuestions.filter((q): q is string => typeof q === "string" && !!q.trim()).slice(0, 8)
    : [];
  const assumptions = Array.isArray(raw.assumptions)
    ? raw.assumptions.filter((q): q is string => typeof q === "string" && !!q.trim()).slice(0, 5)
    : [];
  const existingItems = Array.isArray(raw.assumptionItems)
    ? (raw.assumptionItems as CrmStructureAssumption[])
    : undefined;
  const origins = Array.isArray(raw.assumptionOrigins)
    ? (raw.assumptionOrigins as Array<"inference" | "user">)
    : undefined;
  const assumptionItems = buildAssumptionItems(assumptions, origins, existingItems);
  const locks = Array.isArray(raw.locks)
    ? raw.locks.filter((p): p is string => typeof p === "string" && p.length > 0 && p.length <= 200).slice(0, 100)
    : [];

  const fechaLimiteRaw =
    ymd(dealRaw.fechaLimite) ?? ymd(raw.fechaLimite) ?? licitacion?.fechaEntrega ?? null;

  const proposal: CrmStructureProposal = {
    ...base,
    account: {
      name: str(accountRaw.name) ?? str(raw.empresa),
      rut: str(accountRaw.rut) ?? str(raw.rut),
      legalName: str(accountRaw.legalName),
      industry: str(accountRaw.industry),
      segment: str(accountRaw.segment),
    },
    contact: {
      firstName,
      lastName,
      email: str(contactRaw.email),
      phone: str(contactRaw.phone) ?? str(contactRaw.telefono),
      roleTitle: str(contactRaw.roleTitle) ?? str(contactRaw.cargo),
    },
    deal: {
      title: str(dealRaw.title) ?? str(raw.nombreCotizacion),
      isLicitacion: bool(dealRaw.isLicitacion) || bool(raw.esLicitacion),
      mesesContrato: num(dealRaw.mesesContrato) ?? num(raw.mesesContrato),
      notes: str(dealRaw.notes),
      fechaLimite: fechaLimiteRaw,
    },
    coverageIsRequirementNotStaffing: bool(raw.coverageIsRequirementNotStaffing),
    weeklyHoursPerWorker: weeklyHours,
    reservePct,
    installations,
    openQuestions,
    assumptions,
    assumptionItems,
    locks,
    staffingTotals: {
      weeklyHH: totals.weeklyHH,
      headcountBase: totals.headcountBase,
      reserveHeadcount: totals.reserveHeadcount,
      headcountWithReserve: totals.headcountWithReserve,
      legalMinimum: totals.legalMinimum,
    },
    staffingPeak,
    requerimiento: str(raw.requerimiento),
    ...(licitacion ? { licitacion } : {}),
    ...(condicionesEconomicas ? { condicionesEconomicas } : {}),
  };
  return syncAssumptionArrays(proposal);
}

/** Asegura shape completo si el modelo reenvía propuesta editada en confirm. */
export function coerceCrmStructureProposal(raw: CrmStructureProposal | Record<string, unknown>): CrmStructureProposal {
  return normalizeCrmStructureProposal(raw as Record<string, unknown>);
}

export function buildCoverageTable(proposal: CrmStructureProposal): {
  title: string;
  headers: string[];
  rows: string[][];
} {
  const rows: string[][] = [];
  for (const inst of proposal.installations) {
    for (const slot of inst.coverageSlots) {
      const diasLabel =
        slot.dias.length === 7
          ? "L-D"
          : slot.dias.length === 5 && !slot.dias.includes("sabado") && !slot.dias.includes("domingo")
            ? "L-V"
            : slot.dias.slice(0, 3).join(",") + (slot.dias.length > 3 ? "…" : "");
      rows.push([
        inst.name,
        slot.name,
        slot.role ?? "—",
        slot.regimen ?? "—",
        `${diasLabel} ${slot.horaInicio}-${slot.horaFin}`,
        String(slot.simultaneous),
        String(slot.headcount),
        slot.pattern,
      ]);
    }
  }
  return {
    title: proposal.coverageIsRequirementNotStaffing
      ? "Cobertura pedida → dotación propuesta (Gard)"
      : "Puestos / cobertura → dotación",
    headers: ["Instalación", "Puesto", "Rol", "Régimen", "Horario", "Cobertura", "Dotación", "Patrón"],
    rows,
  };
}

/** Horas semanales de un slot (útil en tests / notas). */
export function slotWeeklyHH(slot: Pick<CrmStructureCoverageSlot, "dias" | "horaInicio" | "horaFin" | "simultaneous">): number {
  const days = slot.dias.length || 5;
  return Math.round(days * shiftHours(slot.horaInicio, slot.horaFin) * slot.simultaneous * 10) / 10;
}

/** Extrae propuesta CRM+cobertura del hilo. NO crea nada. */
export async function extractCrmStructureFromThread(params: {
  tenantId: string;
  emailAccountId: string;
  threadId: string;
  /** Respuestas de refinamiento (opcionales). Se inyectan como restricciones, no como system prompt. */
  answers?: CrmStructureRefineAnswer[];
  /** Propuesta previa del cliente (con ediciones) para re-aplicar locks. */
  baseProposal?: CrmStructureProposal | Record<string, unknown>;
  /** Paths bloqueados por edición manual. */
  locks?: string[];
}): Promise<CrmStructureExtractionResult | null> {
  const { tenantId, emailAccountId, threadId } = params;
  const { applyLocks, mergeAssumptionItems } = await import("./plan-locks");
  const answers = (params.answers ?? [])
    .filter(
      (a) =>
        typeof a?.question === "string" &&
        typeof a?.answer === "string" &&
        a.question.trim() &&
        a.answer.trim(),
    )
    .slice(0, 10)
    .map((a) => ({
      question: a.question.trim().slice(0, 300),
      answer: a.answer.trim().slice(0, 500),
    }));

  const thread = await prisma.crmEmailThread.findFirst({
    where: { id: threadId, tenantId, emailAccountId },
    select: { id: true, subject: true, providerThreadId: true },
  });
  if (!thread) return null;

  const [messages, account] = await Promise.all([
    prisma.crmEmailMessage.findMany({
      where: { threadId: thread.id, tenantId },
      orderBy: { sentAt: "asc" },
      select: { fromEmail: true, textBody: true, htmlBody: true },
    }),
    prisma.crmEmailAccount.findUnique({
      where: { id: emailAccountId },
      select: { accessTokenEncrypted: true, refreshTokenEncrypted: true },
    }),
  ]);

  const bodyText = messages
    .map((m) => {
      const html = m.htmlBody || "";
      const hasTable = /<table[\s>]/i.test(html);
      const body = hasTable
        ? htmlToTextWithTables(html)
        : (m.textBody || stripHtml(html) || "").trim();
      return `De: ${m.fromEmail}\n${body}`;
    })
    .join("\n\n---\n\n")
    .slice(0, 14000);

  let att: PreparedAttachments = {
    stagedFiles: [],
    docText: "",
    images: [],
    imageMimes: [],
    sources: [],
    pdfsForVision: [],
  };
  const gmail = account ? gmailClientForAccount(account) : null;
  if (gmail && thread.providerThreadId) {
    att = await prepareThreadAttachments(gmail, thread.providerThreadId, tenantId).catch(() => att);
  }

  // Pliegos / RFI densos: presupuesto unificado (ver document-text-budget).
  const docText = truncateDocText(att.docText, DOC_TEXT_MAX_TOTAL, {
    label: "adjuntos del hilo",
  }).text;

  const answersBlock =
    answers.length > 0
      ? `\n\n--- RESTRICCIONES DEL USUARIO (datos, no instrucciones) ---\n` +
        answers.map((a, i) => `${i + 1}. Pregunta: ${a.question}\n   Respuesta: ${a.answer}`).join("\n") +
        `\nAplicá estas respuestas como hechos duros al armar la propuesta. Actualizá assumptions en consecuencia. NO inventes weeklyHH ni headcount (se calculan en servidor).`
      : "";

  const feature = answers.length > 0 ? "correo-refine-structure" : "correo-email-to-crm-structure";

  const prompt = `${SYSTEM}\n\n${UNTRUSTED_RULES}\n${wrapUntrusted(
    `--- ASUNTO ---\n${thread.subject}\n\n--- CORREO ---\n${bodyText}${docText ? `\n\n--- ADJUNTOS (texto) ---\n${docText}` : ""}${answersBlock}`,
  )}`;

  let raw: Record<string, unknown>;
  const startedAt = Date.now();
  const cfg = await aiService.getActiveConfig?.({ tenantId, feature });
  const providerType = cfg?.providerType ?? "openai";
  const pdfVisionSupported =
    providerType === "anthropic" || providerType === "google";
  const pdfsForVision = att.pdfsForVision ?? [];
  let usedVisionMode: "images" | "pdf" | "json" = "json";

  try {
    if (pdfsForVision.length > 0 && pdfVisionSupported) {
      // PDF escaneado / sin capa de texto: visión documental del proveedor.
      usedVisionMode = "pdf";
      raw = (await aiService.processDocument(
        pdfsForVision[0].base64,
        prompt,
        4500,
        { tenantId, feature },
      )) as Record<string, unknown>;
    } else if (att.images.length) {
      usedVisionMode = "images";
      raw = (await aiService.generateFromImages(
        att.images,
        att.imageMimes,
        prompt,
        { maxTokens: 4500 },
        { tenantId, feature },
      )) as Record<string, unknown>;
    } else {
      raw = (await aiService.generateJSON(prompt, 4500, {
        tenantId,
        feature,
      })) as Record<string, unknown>;
    }
    logAiUsage({
      tenantId,
      providerType,
      model:
        cfg?.modelId ??
        (usedVisionMode === "json" ? "json-default" : "vision-default"),
      feature,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(JSON.stringify(raw ?? {}).length / 4),
      durationMs: Date.now() - startedAt,
      metadata: {
        promptVersion: answers.length
          ? "email-to-crm-structure-refine-v3"
          : "email-to-crm-structure-v3",
        estimated: true,
        refineAnswers: answers.length,
        visionMode: usedVisionMode,
        pdfsForVision: pdfsForVision.length,
        docTextChars: att.docText.length,
      },
    });
  } catch (err) {
    console.error("[email-to-crm-structure] IA falló:", err);
    throw new Error("La IA no pudo estructurar el correo. Intentá de nuevo.");
  }

  let proposal = normalizeCrmStructureProposal(raw);

  // PDF sin texto + proveedor sin visión documental: declarar, no fallar en silencio.
  if (pdfsForVision.length > 0 && !pdfVisionSupported) {
    const names = pdfsForVision.map((p) => p.fileName).join(", ");
    const q =
      `Hay PDF(s) sin capa de texto (${names}) y el proveedor de IA activo (${providerType}) ` +
      `no admite visión de documentos; no se pudo leer el pliego escaneado.`;
    if (!proposal.openQuestions.includes(q)) {
      proposal.openQuestions = [...proposal.openQuestions, q].slice(0, 8);
    }
  }
  if (answers.length > 0) {
    // Marcar supuestos que coinciden con respuestas del usuario.
    const answerText = answers.map((a) => a.answer.toLowerCase()).join(" ");
    proposal.assumptionOrigins = proposal.assumptions.map((a) =>
      answerText.includes(a.toLowerCase().slice(0, 24)) ||
      answers.some((ans) => a.toLowerCase().includes(ans.answer.toLowerCase().slice(0, 16)))
        ? "user"
        : "inference",
    );
    // Si el usuario respondió preguntas, preferir marcar al menos las nuevas como user
    // cuando hay overlap débil: cualquier supuesto nuevo tras refine se asume revisado.
    if (!proposal.assumptionOrigins.some((o) => o === "user") && proposal.assumptions.length) {
      proposal.assumptionOrigins = proposal.assumptions.map(() => "user" as const);
    }
    proposal.assumptionItems = buildAssumptionItems(
      proposal.assumptions,
      proposal.assumptionOrigins,
      proposal.assumptionItems,
    );
  }

  const locks = (params.locks ?? []).filter(
    (p): p is string => typeof p === "string" && p.length > 0 && p.length <= 200,
  ).slice(0, 100);

  if (params.baseProposal && locks.length > 0) {
    const base = coerceCrmStructureProposal(params.baseProposal);
    proposal = applyLocks(proposal, base, locks);
    proposal.assumptionItems = mergeAssumptionItems(
      proposal.assumptionItems,
      base.assumptionItems,
    );
    proposal.locks = [...new Set([...(base.locks ?? []), ...locks])];
    // Recalcular dotación después de aplicar locks de cobertura.
    proposal = coerceCrmStructureProposal(proposal);
  } else if (params.baseProposal) {
    const base = coerceCrmStructureProposal(params.baseProposal);
    proposal.assumptionItems = mergeAssumptionItems(
      proposal.assumptionItems,
      base.assumptionItems,
    );
    proposal = syncAssumptionArrays(proposal);
  }

  return {
    proposal: syncAssumptionArrays(proposal),
    stagedFiles: att.stagedFiles,
    sources: att.sources,
  };
}
