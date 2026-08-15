/**
 * Esquema de contenido de propuesta técnica v2 (secciones dinámicas + estados).
 * Fuente de verdad del PDF de licitación / documento único institucional.
 */
import { z } from "zod";
import { nanoid } from "nanoid";
import { ECONOMIC_OPENING_TITLE } from "@/lib/cpq/economic-opening";
import { GARD_FIXED_SECTION_SEED } from "@/lib/cpq/fixed-sections";

export const PROPOSAL_V2_VERSION = 2 as const;

export const PROPOSAL_MODES = ["licitacion", "comercial"] as const;
export type ProposalMode = (typeof PROPOSAL_MODES)[number];

export const PROPOSAL_STATUSES = ["borrador", "en_revision", "aprobada", "enviada"] as const;
export type ProposalDocStatus = (typeof PROPOSAL_STATUSES)[number];

export const SECTION_STATUSES = ["ia", "editada", "aprobada"] as const;
export type ProposalSectionStatus = (typeof SECTION_STATUSES)[number];

export const SECTION_ORIGINS = ["fija_empresa", "ia", "auto", "bases"] as const;
export type ProposalSectionOrigin = (typeof SECTION_ORIGINS)[number];

export const INVARIANT_KEYS = ["identificacion", "exclusiones", "matriz"] as const;
export type InvariantKey = (typeof INVARIANT_KEYS)[number];

export const SECTION_KINDS = ["oferta_economica", "dotacion"] as const;
export type ProposalSectionKind = (typeof SECTION_KINDS)[number];
export const OFERTA_ECONOMICA_KIND: ProposalSectionKind = "oferta_economica";
export const DOTACION_KIND: ProposalSectionKind = "dotacion";

export const INVARIANT_TITLES: Record<InvariantKey, string> = {
  identificacion: "Identificación",
  exclusiones: "Exclusiones y supuestos",
  matriz: "Matriz de cumplimiento",
};

export const sectionSchema = z.object({
  id: z.string().min(1),
  order: z.number().int(),
  title: z.string().min(1),
  ref: z.string().nullable().optional(),
  status: z.enum(SECTION_STATUSES),
  sources: z.array(z.string()).default([]),
  content: z.string(),
  invariant: z.enum(INVARIANT_KEYS).optional(),
  kind: z.enum(SECTION_KINDS).optional(),
  origin: z.enum(SECTION_ORIGINS).optional(),
  /** Clave en biblioteca CpqFixedSection cuando origin=fija_empresa. */
  fixedKey: z.string().optional(),
});

export type ProposalSection = z.infer<typeof sectionSchema>;

export const proposalContentV2Schema = z.object({
  version: z.literal(2),
  mode: z.enum(PROPOSAL_MODES),
  status: z.enum(PROPOSAL_STATUSES),
  sections: z.array(sectionSchema),
  truncatedCorpus: z.boolean().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  sentBy: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  updatedAt: z.string(),
  legacyV1: z.unknown().optional(),
  /** true mientras corre generate-all / auto-gen en background. */
  generating: z.boolean().optional(),
});

export type ProposalContentV2 = z.infer<typeof proposalContentV2Schema>;

export type ProposalAIContentV1 = {
  descripcionBreve?: string;
  resumenEjecutivo?: string;
  analisisNecesidades?: string;
  sectoresRelevantes?: string[];
};

export function isProposalContentV2(value: unknown): value is ProposalContentV2 {
  return proposalContentV2Schema.safeParse(value).success;
}

export function isProposalContentV1(value: unknown): value is ProposalAIContentV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  if (o.version === 2) return false;
  return (
    typeof o.descripcionBreve === "string" ||
    typeof o.resumenEjecutivo === "string" ||
    typeof o.analisisNecesidades === "string"
  );
}

export function newSectionId(): string {
  return nanoid(12);
}

function section(
  title: string,
  content: string,
  opts?: {
    invariant?: InvariantKey;
    kind?: ProposalSectionKind;
    origin?: ProposalSectionOrigin;
    fixedKey?: string;
    order?: number;
    status?: ProposalSectionStatus;
    sources?: string[];
  },
): ProposalSection {
  return {
    id: newSectionId(),
    order: opts?.order ?? 0,
    title,
    ref: null,
    status: opts?.status ?? "ia",
    sources: opts?.sources ?? [],
    content,
    invariant: opts?.invariant,
    kind: opts?.kind,
    origin: opts?.origin,
    fixedKey: opts?.fixedKey,
  };
}

function reindex(sections: ProposalSection[]): ProposalSection[] {
  return sections.map((s, i) => ({ ...s, order: i }));
}

function fixedByKey(key: string): { title: string; content: string } {
  const row = GARD_FIXED_SECTION_SEED.find((s) => s.key === key);
  return {
    title: row?.title ?? key,
    content: row?.content ?? "",
  };
}

/**
 * Índice institucional comercial (12+ capítulos).
 * Fijas usan textos seed; en runtime se sobrescriben desde la biblioteca del tenant.
 */
export function buildInstitutionalCommercialSections(): ProposalSection[] {
  const quienes = fixedByKey("quienes_somos");
  const uniformes = fixedByKey("uniformes_epp");
  const capacitacion = fixedByKey("capacitacion");
  const opai = fixedByKey("opai_sla");
  const supervision = fixedByKey("supervision_contingencias");
  const preventivo = fixedByKey("preventivo");
  const experiencia = fixedByKey("experiencia_certificaciones");
  const matrizOferente = fixedByKey("matriz_oferente");

  return reindex([
    section(INVARIANT_TITLES.identificacion, "", {
      invariant: "identificacion",
      origin: "ia",
      sources: ["cpq"],
    }),
    section("Resumen ejecutivo", "", { origin: "ia", sources: ["cpq"] }),
    section(quienes.title, quienes.content, {
      origin: "fija_empresa",
      fixedKey: "quienes_somos",
      sources: ["biblioteca"],
    }),
    section("Comprensión del servicio", "", { origin: "ia", sources: ["cpq"] }),
    section("Dotación propuesta", "", {
      kind: DOTACION_KIND,
      origin: "auto",
      sources: ["costeo", "puestos"],
    }),
    section(uniformes.title, uniformes.content, {
      origin: "fija_empresa",
      fixedKey: "uniformes_epp",
      sources: ["biblioteca"],
    }),
    section(capacitacion.title, capacitacion.content, {
      origin: "fija_empresa",
      fixedKey: "capacitacion",
      sources: ["biblioteca"],
    }),
    section(opai.title, opai.content, {
      origin: "fija_empresa",
      fixedKey: "opai_sla",
      sources: ["biblioteca"],
    }),
    section(supervision.title, supervision.content, {
      origin: "fija_empresa",
      fixedKey: "supervision_contingencias",
      sources: ["biblioteca"],
    }),
    section(preventivo.title, preventivo.content, {
      origin: "fija_empresa",
      fixedKey: "preventivo",
      sources: ["biblioteca"],
    }),
    section("Carta Gantt de implementación", "", { origin: "ia", sources: ["cpq"] }),
    section(experiencia.title, experiencia.content, {
      origin: "fija_empresa",
      fixedKey: "experiencia_certificaciones",
      sources: ["biblioteca"],
    }),
    section(matrizOferente.title, matrizOferente.content, {
      origin: "fija_empresa",
      fixedKey: "matriz_oferente",
      sources: ["biblioteca"],
    }),
    section(
      INVARIANT_TITLES.exclusiones,
      "Pendiente de completar.",
      { invariant: "exclusiones", origin: "ia" },
    ),
    section(ECONOMIC_OPENING_TITLE, "", {
      kind: OFERTA_ECONOMICA_KIND,
      origin: "auto",
      sources: ["costeo"],
    }),
  ]);
}

/** Esqueleto de licitación = plantilla institucional + invariante matriz. */
export function buildLicitacionSkeletonSections(): ProposalSection[] {
  const institutional = buildInstitutionalCommercialSections().filter(
    (s) => s.kind !== OFERTA_ECONOMICA_KIND && s.invariant !== "exclusiones",
  );
  const withoutMatrizFija = institutional.filter((s) => s.fixedKey !== "matriz_oferente");
  return reindex([
    ...withoutMatrizFija,
    section(
      INVARIANT_TITLES.exclusiones,
      "Pendiente: se completará con lo no cubierto por las bases y la cotización.",
      { invariant: "exclusiones", origin: "ia" },
    ),
    section(ECONOMIC_OPENING_TITLE, "", {
      kind: OFERTA_ECONOMICA_KIND,
      origin: "auto",
      sources: ["costeo"],
    }),
    section(INVARIANT_TITLES.matriz, "", {
      invariant: "matriz",
      origin: "auto",
      sources: ["bases"],
    }),
  ]);
}

export function emptyProposalV2(
  mode: ProposalMode,
  opts?: { legacyV1?: unknown },
): ProposalContentV2 {
  const now = new Date().toISOString();
  const sections =
    mode === "licitacion"
      ? buildLicitacionSkeletonSections()
      : buildInstitutionalCommercialSections();

  return {
    version: 2,
    mode,
    status: "borrador",
    sections,
    updatedAt: now,
    legacyV1: opts?.legacyV1,
  };
}

/**
 * Migración lazy v1 → v2. Conserva los campos v1 en `legacyV1`.
 * No inventa contenido: copia la prosa existente a secciones equivalentes.
 */
export function migrateV1ToV2(
  v1: ProposalAIContentV1 | null | undefined,
  mode: ProposalMode = "comercial",
): ProposalContentV2 {
  const legacy = v1 ?? {};
  const base = emptyProposalV2(mode, { legacyV1: legacy });
  const desc = (legacy.descripcionBreve ?? "").trim();
  const resumen = (legacy.resumenEjecutivo ?? "").trim();
  const analisis = (legacy.analisisNecesidades ?? "").trim();
  const sectores = Array.isArray(legacy.sectoresRelevantes)
    ? legacy.sectoresRelevantes.filter((s) => typeof s === "string" && s.trim())
    : [];

  const byInv = (k: InvariantKey) => base.sections.find((s) => s.invariant === k);
  const ident = byInv("identificacion") ?? base.sections[0];
  if (ident) ident.content = desc;

  if (mode === "comercial") {
    const resumenSec = base.sections.find((s) => s.title === "Resumen ejecutivo");
    const analisisSec = base.sections.find(
      (s) => s.title === "Comprensión del servicio" || s.title === "Análisis de necesidades",
    );
    if (resumenSec) resumenSec.content = resumen;
    if (analisisSec) {
      analisisSec.content = [analisis, sectores.length ? `Sectores: ${sectores.join(", ")}` : ""]
        .filter(Boolean)
        .join("\n\n");
    }
  } else {
    const extra: ProposalSection[] = [];
    if (resumen) {
      extra.push(
        section("Resumen ejecutivo", resumen, {
          status: "ia",
          origin: "ia",
          sources: ["legacy_v1"],
        }),
      );
    }
    if (analisis) {
      extra.push(
        section("Comprensión del servicio", analisis, {
          status: "ia",
          origin: "ia",
          sources: ["legacy_v1"],
        }),
      );
    }
    const titles = new Set(base.sections.map((s) => s.title.toLowerCase()));
    const filtered = extra.filter((s) => !titles.has(s.title.toLowerCase()));
    if (filtered.length) {
      const identIdx = base.sections.findIndex((s) => s.invariant === "identificacion");
      const before = base.sections.slice(0, identIdx + 1);
      const after = base.sections.slice(identIdx + 1);
      base.sections = reindex([...before, ...filtered, ...after]);
    } else {
      const resumenSec = base.sections.find((s) => s.title === "Resumen ejecutivo");
      const comprension = base.sections.find((s) => s.title === "Comprensión del servicio");
      if (resumenSec && resumen) resumenSec.content = resumen;
      if (comprension && analisis) comprension.content = analisis;
    }
  }

  return base;
}

/** Lee JSON persistido: v2 tal cual, v1 migrado, vacío → plantilla. */
export function readProposalContent(
  raw: unknown,
  mode: ProposalMode = "comercial",
): ProposalContentV2 {
  if (isProposalContentV2(raw)) return raw;
  if (isProposalContentV1(raw)) return migrateV1ToV2(raw, mode);
  return emptyProposalV2(mode, raw != null ? { legacyV1: raw } : undefined);
}

export function findInvariant(
  content: ProposalContentV2,
  key: InvariantKey,
): ProposalSection | undefined {
  return content.sections.find((s) => s.invariant === key);
}

export function sortedSections(content: ProposalContentV2): ProposalSection[] {
  return [...content.sections].sort((a, b) => a.order - b.order);
}

/** Pill de origen para UI (Vacía si no hay contenido y no es auto). */
export function sectionOriginPill(s: ProposalSection): "Fija" | "IA" | "Auto" | "Bases" | "Vacía" {
  if (s.origin === "fija_empresa") return "Fija";
  if (s.origin === "bases") return "Bases";
  if (s.origin === "auto" || s.kind === OFERTA_ECONOMICA_KIND || s.kind === DOTACION_KIND) {
    return "Auto";
  }
  if (!s.content.trim() && s.status === "ia") return "Vacía";
  return "IA";
}
