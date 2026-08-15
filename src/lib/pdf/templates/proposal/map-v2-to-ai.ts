/**
 * Mapea secciones v2 comerciales a las props AI del variant `technical`.
 */
import { findInvariant, type ProposalContentV2 } from "@/lib/cpq/proposal-sections/schema";
import type { ProposalAIContent } from "./proposal-ai";

function sectionByTitle(content: ProposalContentV2, re: RegExp): string {
  const hit = [...content.sections]
    .sort((a, b) => a.order - b.order)
    .find((s) => re.test(s.title));
  return hit?.content.trim() ?? "";
}

function bulletLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[•●▪◦*\-–—]\s*/.test(line))
    .map((line) => line.replace(/^[•●▪◦*\-–—]\s*/, "").trim())
    .filter(Boolean);
}

function withoutHeadcount(value: string): string {
  return value
    .replace(/\([^)]*\b\d+\b[^)]*\)/g, "")
    .replace(/\b\d+\s*(?:personas?|trabajadores?|guardias?|supervisores?|inspectores?|cargos?)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([/·,;])/g, "$1")
    .trim();
}

function extractOrganigramRoles(value: string): string[] {
  const roleWords =
    /\b(?:gerenc|jef|supervis|guard|inspector|central|coordin|operaci|monitoreo|soporte|prevenci|ejecutiv|administraci|finanzas|tecnolog|calidad|reclutamiento|capacitaci)\w*/i;
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[•●▪◦*\-–—]\s*/, ""))
    .filter((line) => line.length > 1 && line.length <= 110);
  return [...new Set(
    lines
      .map(withoutHeadcount)
      .filter((line) => line.length > 1 && roleWords.test(line)),
  )].slice(0, 18);
}

function extractCertifications(value: string): string[] {
  const certificationWords =
    /\b(?:certific|acredit|os[\s-]?10|iso|normativ|cumplimiento|ley|decreto|resoluci)\w*/i;
  return [...new Set(
    bulletLines(value).filter((line) => certificationWords.test(line)),
  )].slice(0, 12);
}

export function mapV2ToProposalAI(content: ProposalContentV2): ProposalAIContent {
  const ident =
    findInvariant(content, "identificacion")?.content.trim() ||
    sectionByTitle(content, /identific/i);
  const resumen = sectionByTitle(content, /resumen/i);
  const comprension =
    sectionByTitle(content, /comprensi[oó]n/i) ||
    sectionByTitle(content, /an[aá]lisis/i);
  const quienes = sectionByTitle(content, /qui[eé]nes somos/i);
  const dotacion = sectionByTitle(content, /dotaci[oó]n/i);
  const uniformes = sectionByTitle(content, /uniformes?.*epp|epp.*uniformes?/i);
  const capacitacion = sectionByTitle(content, /capacitaci[oó]n/i);
  const opai = sectionByTitle(content, /opai.*sla|sla.*opai/i);
  const supervision = sectionByTitle(content, /supervisi[oó]n.*conting|conting.*supervisi[oó]n/i);
  const preventivo = sectionByTitle(content, /enfoque preventivo|prevenci[oó]n/i);
  const gantt = sectionByTitle(content, /gantt|implementaci[oó]n/i);
  const experiencia = sectionByTitle(content, /experiencia.*certific|certific.*experiencia/i);
  const exclusiones =
    findInvariant(content, "exclusiones")?.content.trim() ||
    sectionByTitle(content, /exclusiones|supuestos/i);
  const legacy = content.legacyV1 && typeof content.legacyV1 === "object"
    ? content.legacyV1 as Record<string, unknown>
    : null;
  const legacySectors = Array.isArray(legacy?.sectoresRelevantes)
    ? legacy.sectoresRelevantes.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    descripcionBreve: ident || resumen || "Propuesta comercial",
    resumenEjecutivo: resumen || ident || "",
    analisisNecesidades: comprension || "",
    sectoresRelevantes: legacySectors,
    institutional: {
      quienesSomos: quienes || undefined,
      comprensionServicio: comprension || undefined,
      dotacion: dotacion || undefined,
      uniformesEpp: uniformes || undefined,
      capacitacion: capacitacion || undefined,
      opaiSla: opai || undefined,
      supervisionContingencias: supervision || undefined,
      enfoquePreventivo: preventivo || undefined,
      cartaGantt: gantt || undefined,
      experienciaCertificaciones: experiencia || undefined,
      exclusiones: exclusiones || undefined,
    },
    organigramRoles: extractOrganigramRoles(quienes),
    certifications: extractCertifications(experiencia),
  };
}
