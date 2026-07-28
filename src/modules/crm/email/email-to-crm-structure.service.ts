import { prisma } from "@/lib/prisma";
import { aiService } from "@/lib/ai-service";
import { logAiUsage } from "@/lib/platform-ai-service";
import {
  staffingForCoverageSlot,
  sumStaffing,
  normalizeWeekdays,
  shiftHours,
} from "@/lib/crm/coverage-to-staffing";
import { UNTRUSTED_RULES, wrapUntrusted } from "./ai-untrusted";
import { gmailClientForAccount } from "./gmail-account-client";
import { prepareThreadAttachments, type PreparedAttachments } from "./email-to-lead-attachments";
import { WEEKDAYS_FULL } from "./email-to-lead.types";
import {
  emptyCrmStructureProposal,
  syncAssumptionArrays,
  type CrmStructureAssumption,
  type CrmStructureCoverageSlot,
  type CrmStructureExtractionResult,
  type CrmStructureInstallation,
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
Extraes del correo + adjuntos (RFI, bases, SoW, consulta al mercado) la ESTRUCTURA CRM + COBERTURA para proponer alta en OPAI.

Devuelve SOLO un objeto JSON con EXACTAMENTE estas claves:
{
  "account": { "name": string|null, "rut": string|null, "legalName": string|null, "industry": string|null, "segment": string|null },
  "contact": { "firstName": string|null, "lastName": string|null, "email": string|null, "phone": string|null, "roleTitle": string|null },
  "deal": { "title": string|null, "isLicitacion": boolean, "mesesContrato": number|null, "notes": string|null, "fechaLimite": string|null },
  "coverageIsRequirementNotStaffing": boolean,
  "weeklyHoursPerWorker": number,
  "requerimiento": string|null,
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
          "notes": string|null
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
7. openQuestions: ambigüedades caras (ej. jefe de turno adicional, colación, jornada parcial). Máx 5.
8. assumptions: supuestos razonables que aplicaste. Máx 5.
9. No inventes RUT, montos ni emails. Si el contacto solo trae teléfono, email puede ser null.
10. Extrae TODOS los slots del cuadro de cobertura; no resumas "9 dependencias" en un solo slot genérico.`;

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
  const dias = normalizeWeekdays(Array.isArray(raw.dias) ? raw.dias.map(String) : [...WEEKDAYS_FULL]);
  const horaInicio = normalizeTime(raw.horaInicio, "08:00");
  const horaFin = normalizeTime(raw.horaFin, "20:00");
  const simultaneous = Math.max(1, num(raw.simultaneous) ?? num(raw.cobertura) ?? num(raw.numPuestos) ?? 1);
  const regimen = str(raw.regimen);
  const staff = staffingForCoverageSlot(
    { simultaneous, dias, horaInicio, horaFin, regimen },
    weeklyHours,
  );
  return {
    name,
    role: str(raw.role) ?? str(raw.rol),
    regimen,
    dias: dias.length ? dias : [...WEEKDAYS_FULL],
    horaInicio,
    horaFin,
    simultaneous,
    notes: str(raw.notes),
    weeklyHH: staff.weeklyHH,
    headcount: staff.headcount,
    pattern: staff.pattern,
    staffingRationale: staff.rationale,
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
  // reservePct en propuesta = porcentaje 0–100; sumStaffing espera fracción 0–1.
  const reservePctRaw = Number(raw.reservePct);
  const reservePct =
    Number.isFinite(reservePctRaw) && reservePctRaw >= 0 && reservePctRaw <= 100
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

  const openQuestions = Array.isArray(raw.openQuestions)
    ? raw.openQuestions.filter((q): q is string => typeof q === "string" && !!q.trim()).slice(0, 5)
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
      fechaLimite: str(dealRaw.fechaLimite) ?? str(raw.fechaLimite),
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
    requerimiento: str(raw.requerimiento),
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
    .map((m) => `De: ${m.fromEmail}\n${(m.textBody || m.htmlBody?.replace(/<[^>]+>/g, " ") || "").trim()}`)
    .join("\n\n---\n\n")
    .slice(0, 14000);

  let att: PreparedAttachments = { stagedFiles: [], docText: "", images: [], imageMimes: [], sources: [] };
  const gmail = account ? gmailClientForAccount(account) : null;
  if (gmail && thread.providerThreadId) {
    att = await prepareThreadAttachments(gmail, thread.providerThreadId, tenantId).catch(() => att);
  }

  // Más contexto de adjuntos: cuadros de cobertura RFI suelen ser densos.
  const docText = att.docText.slice(0, 24000);

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
  try {
    raw = (att.images.length
      ? await aiService.generateFromImages(
          att.images,
          att.imageMimes,
          prompt,
          { maxTokens: 4500 },
          { tenantId, feature },
        )
      : await aiService.generateJSON(prompt, 4500, {
          tenantId,
          feature,
        })) as Record<string, unknown>;
    const cfg = await aiService.getActiveConfig?.({ tenantId, feature });
    logAiUsage({
      tenantId,
      providerType: cfg?.providerType ?? "openai",
      model: cfg?.modelId ?? (att.images.length ? "vision-default" : "json-default"),
      feature,
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: Math.ceil(JSON.stringify(raw ?? {}).length / 4),
      durationMs: Date.now() - startedAt,
      metadata: {
        promptVersion: answers.length ? "email-to-crm-structure-refine-v1" : "email-to-crm-structure-v1",
        estimated: true,
        refineAnswers: answers.length,
      },
    });
  } catch (err) {
    console.error("[email-to-crm-structure] IA falló:", err);
    throw new Error("La IA no pudo estructurar el correo. Intentá de nuevo.");
  }

  let proposal = normalizeCrmStructureProposal(raw);
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
