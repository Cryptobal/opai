/**
 * Matriz de cumplimiento derivada del JSON v2 (nunca de salida directa de IA).
 * Cada fila: requisito citado (ref) → sección → CUMPLE | PARCIAL | EXCLUIDO.
 */
import type { ProposalContentV2, ProposalSection } from "./schema";

export type ComplianceLevel = "CUMPLE" | "PARCIAL" | "EXCLUIDO";

export type ComplianceRow = {
  ref: string;
  requirement: string;
  sectionId: string | null;
  sectionTitle: string | null;
  level: ComplianceLevel;
};

const EXCLUIDO_HINT = /\b(exclu|no se incluye|fuera de alcance|no aplica|no contemplad)/i;
const PARCIAL_HINT = /\b(parcial|en la medida|sujeto a|condicionado|salvo)/i;

function levelFor(section: ProposalSection | undefined, inExclusiones: boolean): ComplianceLevel {
  if (inExclusiones || !section) return "EXCLUIDO";
  const text = `${section.title}\n${section.content}`;
  if (EXCLUIDO_HINT.test(text)) return "EXCLUIDO";
  if (PARCIAL_HINT.test(text) || !section.content.trim()) return "PARCIAL";
  return "CUMPLE";
}

function splitRefs(ref: string | null | undefined): string[] {
  if (!ref?.trim()) return [];
  return ref
    .split(/[;,|/]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function deriveComplianceMatrix(content: ProposalContentV2): ComplianceRow[] {
  const rows: ComplianceRow[] = [];
  const seen = new Set<string>();
  const excl = content.sections.find((s) => s.invariant === "exclusiones");
  const exclText = excl?.content ?? "";

  for (const section of content.sections) {
    if (section.invariant === "matriz") continue;
    const refs = splitRefs(section.ref);
    if (refs.length === 0 && section.invariant !== "exclusiones") continue;
    for (const ref of refs.length ? refs : []) {
      const key = `${ref}::${section.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const inExcl = section.invariant === "exclusiones" || exclText.includes(ref);
      rows.push({
        ref,
        requirement: section.title,
        sectionId: section.id,
        sectionTitle: section.title,
        level: levelFor(section, inExcl),
      });
    }
  }

  // Referencias citadas solo en exclusiones (sin sección propia).
  const orphan = exclText.match(/(?:§|punto|numeral|anexo)\s*[\d.]+/gi) ?? [];
  for (const raw of orphan) {
    const ref = raw.trim();
    if (rows.some((r) => r.ref === ref)) continue;
    rows.push({
      ref,
      requirement: "Mencionado en exclusiones",
      sectionId: excl?.id ?? null,
      sectionTitle: excl?.title ?? null,
      level: "EXCLUIDO",
    });
  }

  return rows;
}

export function formatComplianceMatrixText(rows: ComplianceRow[]): string {
  if (!rows.length) {
    return "Sin requisitos citados con referencia a las bases. Completar `ref` en las secciones para autogenerar la matriz.";
  }
  const lines = [
    "Requisito (bases) | Sección de la propuesta | Cumplimiento",
    "---|---|---",
    ...rows.map((r) => `${r.ref} | ${r.sectionTitle ?? "—"} | ${r.level}`),
  ];
  return lines.join("\n");
}
