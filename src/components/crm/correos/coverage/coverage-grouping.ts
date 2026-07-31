import { computePeakStaffing } from "@/lib/crm/coverage-to-staffing";
import { WEEKDAYS_FULL } from "@/modules/crm/email/email-to-lead.types";
import type {
  CrmStructureCoverageSlot,
  CrmStructureInstallation,
  CrmStructureStaffingPeak,
} from "@/modules/crm/email/email-to-crm-structure.types";

export const GENERAL_ETAPA_KEY = "General";

export type SlotRef = { instIdx: number; slotIdx: number };

export type CoverageStageGroup = {
  key: string;
  label: string;
  vigenciaDesde: string | null;
  vigenciaHasta: string | null;
  slots: Array<SlotRef & { slot: CrmStructureCoverageSlot }>;
  subtotalHH: number;
  subtotalHeadcount: number;
};

/**
 * Próximo nombre libre "Puesto N" dentro de un grupo. Un puesto agregado a mano
 * nunca nace sin nombre: el normalizador server descartaba esos slots.
 */
export function nextSlotName(
  existing: Array<{ name?: string | null }>,
  prefix = "Puesto",
): string {
  const re = new RegExp(`^${prefix}\\s+(\\d+)$`, "i");
  let max = 0;
  for (const s of existing) {
    const m = (s.name ?? "").trim().match(re);
    if (m) max = Math.max(max, Number(m[1]) || 0);
  }
  return `${prefix} ${max + 1}`;
}

export function emptyCoverageSlot(
  defaults?: Partial<CrmStructureCoverageSlot>,
): CrmStructureCoverageSlot {
  return {
    name: "",
    role: null,
    regimen: "4x4",
    dias: [...WEEKDAYS_FULL],
    horaInicio: "08:00",
    horaFin: "20:00",
    simultaneous: 1,
    notes: null,
    weeklyHH: 0,
    headcount: 1,
    pattern: "",
    staffingRationale: "",
    etapa: null,
    vigenciaDesde: null,
    vigenciaHasta: null,
    ...defaults,
  };
}

/**
 * Agrupa slots por `etapa` (o "General"). Orden: por vigenciaDesde asc,
 * luego label; General al final si no tiene fechas.
 */
export function groupSlotsByEtapa(
  installations: CrmStructureInstallation[],
): CoverageStageGroup[] {
  const map = new Map<string, CoverageStageGroup>();

  installations.forEach((inst, instIdx) => {
    inst.coverageSlots.forEach((slot, slotIdx) => {
      const label = (slot.etapa || "").trim() || GENERAL_ETAPA_KEY;
      const key = label;
      let group = map.get(key);
      if (!group) {
        group = {
          key,
          label,
          vigenciaDesde: slot.vigenciaDesde ?? null,
          vigenciaHasta: slot.vigenciaHasta ?? null,
          slots: [],
          subtotalHH: 0,
          subtotalHeadcount: 0,
        };
        map.set(key, group);
      }
      group.slots.push({ instIdx, slotIdx, slot });
      group.subtotalHH += slot.weeklyHH || 0;
      group.subtotalHeadcount += slot.headcount || 0;
      // Header dates: first non-null wins, then extend max hasta / min desde.
      if (slot.vigenciaDesde) {
        if (!group.vigenciaDesde || slot.vigenciaDesde < group.vigenciaDesde) {
          group.vigenciaDesde = slot.vigenciaDesde;
        }
      }
      if (slot.vigenciaHasta) {
        if (!group.vigenciaHasta || slot.vigenciaHasta > group.vigenciaHasta) {
          group.vigenciaHasta = slot.vigenciaHasta;
        }
      }
    });
  });

  const groups = Array.from(map.values()).map((g) => ({
    ...g,
    subtotalHH: Math.round(g.subtotalHH * 10) / 10,
  }));

  groups.sort((a, b) => {
    const aGen = a.key === GENERAL_ETAPA_KEY;
    const bGen = b.key === GENERAL_ETAPA_KEY;
    if (aGen !== bGen) return aGen ? 1 : -1;
    const ad = a.vigenciaDesde || "9999-99-99";
    const bd = b.vigenciaDesde || "9999-99-99";
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.label.localeCompare(b.label, "es");
  });

  return groups;
}

/** Duplica el slot en la misma instalación, justo después del original. */
export function duplicateSlotAt(
  installations: CrmStructureInstallation[],
  instIdx: number,
  slotIdx: number,
): CrmStructureInstallation[] {
  return installations.map((inst, i) => {
    if (i !== instIdx) return inst;
    const src = inst.coverageSlots[slotIdx];
    if (!src) return inst;
    const copy: CrmStructureCoverageSlot = { ...src, name: src.name ? `${src.name} (copia)` : "" };
    const next = [...inst.coverageSlots];
    next.splice(slotIdx + 1, 0, copy);
    return { ...inst, coverageSlots: next };
  });
}

/** Aplica vigenciaDesde/Hasta a todos los slots del grupo (por etapa key). */
export function bulkSetVigencia(
  installations: CrmStructureInstallation[],
  groupKey: string,
  desde: string | null,
  hasta: string | null,
): CrmStructureInstallation[] {
  const etapaVal = groupKey === GENERAL_ETAPA_KEY ? null : groupKey;
  return installations.map((inst) => ({
    ...inst,
    coverageSlots: inst.coverageSlots.map((slot) => {
      const slotKey = (slot.etapa || "").trim() || GENERAL_ETAPA_KEY;
      if (slotKey !== groupKey) return slot;
      return {
        ...slot,
        etapa: etapaVal ?? slot.etapa ?? null,
        vigenciaDesde: desde,
        vigenciaHasta: hasta,
      };
    }),
  }));
}

/** Fallback cliente si el proposal aún no trae staffingPeak. */
export function clientPeakFallback(
  installations: CrmStructureInstallation[],
): CrmStructureStaffingPeak | null {
  return computePeakStaffing(
    installations.flatMap((i) =>
      i.coverageSlots.map((s) => ({
        headcount: s.headcount,
        weeklyHH: s.weeklyHH,
        vigenciaDesde: s.vigenciaDesde,
        vigenciaHasta: s.vigenciaHasta,
      })),
    ),
  );
}

export function isRondinRegimen(regimen: string | null | undefined): boolean {
  if (!regimen) return false;
  return /rond/i.test(regimen);
}

export type RegimenOption = { value: string; label: string };

/** Roles de turno usados cuando el catálogo CPQ no está disponible (403 / vacío). */
export const REGIMEN_FALLBACK = ["4x4", "7x7", "5x2"];
/** No son roles CPQ: describen cobertura continua / ronda. Van siempre al final. */
export const REGIMEN_SYNTHETIC = ["24/7", "Rondín"];

/**
 * Opciones de régimen: catálogo real de roles CPQ del tenant (si se pudo leer)
 * + las etiquetas sintéticas. Sin catálogo degrada a la lista estática.
 */
export function buildRegimenOptions(
  catalog?: readonly string[] | null,
): RegimenOption[] {
  const names = catalog && catalog.length > 0 ? catalog : REGIMEN_FALLBACK;
  const seen = new Set<string>();
  const out: RegimenOption[] = [];
  for (const raw of [...names, ...REGIMEN_SYNTHETIC]) {
    const value = (raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value, label: value });
  }
  return out;
}
