/**
 * Lógica compartida de generación masiva de secciones (generate_all / generate_missing).
 */
import type { ProposalContentV2, ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import { setSectionContent } from "@/lib/cpq/proposal-sections/ops";
import { generateProposalSection } from "@/lib/cpq/proposal-sections/generate-section";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import {
  buildDotacionContent,
  type DotacionPosition,
} from "@/lib/cpq/proposal-sections/build-dotacion";
import { isPlaceholderExclusionesContent } from "@/lib/cpq/proposal-sections/placeholder-content";

export type GenerateProgress = { generated: number; failed: number; skipped: number };

export type FixedSectionRow = { key: string; title: string; content: string };

export type { DotacionPosition };

/** Sección elegible para generate_missing: vacía o stub, no auto, no editada a mano. */
export function isMissingGeneratableSection(section: ProposalSection): boolean {
  if (isAutoSection(section)) return false;
  if (section.status === "editada") return false;
  if (section.invariant === "exclusiones" && isPlaceholderExclusionesContent(section.content)) {
    return true;
  }
  return !section.content.trim();
}

function normalizeTitle(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleTokens(value: string): Set<string> {
  return new Set(normalizeTitle(value).split(/\s+/).filter((token) => token.length > 1));
}

function tokenSimilarity(left: string, right: string): number {
  const a = titleTokens(left);
  const b = titleTokens(right);
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const jaccard = intersection / new Set([...a, ...b]).size;
  const overlap =
    a.size > 1 && b.size > 1 ? intersection / Math.min(a.size, b.size) : 0;
  return Math.max(jaccard, overlap);
}

export function findFixedSectionMatch<T extends { key: string; title: string }>(
  title: string,
  rows: readonly T[],
  preferFixed: boolean,
): T | undefined {
  const normalized = normalizeTitle(title);
  const exact = rows.find(
    (row) =>
      normalizeTitle(row.title) === normalized ||
      normalizeTitle(row.key) === normalized,
  );
  if (exact) return exact;

  const ranked = rows
    .map((row) => ({ row, score: tokenSimilarity(title, row.title) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  return best && best.score >= (preferFixed ? 0.4 : 0.7) ? best.row : undefined;
}

export function isDotacionSection(section: { title: string; origin?: string }): boolean {
  return titleTokens(section.title).has("dotacion");
}

export function appendGenerationGaps(
  content: ProposalContentV2,
  gaps: readonly string[],
): ProposalContentV2 {
  const exclusion = content.sections.find((section) => section.invariant === "exclusiones");
  if (!exclusion) return content;

  const previous = exclusion.content.trim();
  const newGaps = [...new Set(gaps.map((gap) => gap.trim()).filter(Boolean))].filter(
    (gap) => !previous.includes(gap),
  );
  const gapBlock = newGaps.length
    ? `Brechas detectadas durante la generación:\n${newGaps.map((gap) => `• ${gap}`).join("\n")}`
    : "";
  const body =
    [previous, gapBlock].filter(Boolean).join("\n\n") ||
    "Sin exclusiones adicionales identificadas; validar antes del envío.";
  return setSectionContent(content, exclusion.id, body);
}

type GenerateBatchArgs = {
  content: ProposalContentV2;
  tenantId: string;
  quote: {
    code: string;
    name: string | null;
    clientName: string | null;
    totalGuards: number;
    totalPositions: number;
  };
  fixedSections: readonly FixedSectionRow[];
  positions: readonly DotacionPosition[];
  corpus: Awaited<ReturnType<typeof import("@/modules/crm/documents/licitacion-ingest.service").buildLicitacionCorpus>> | null;
  /** Si true, solo secciones vacías (idempotente). Si false, regenera todas. */
  onlyMissing: boolean;
  /** Si se indica, solo esa sección (debe ser elegible según onlyMissing). Legacy; preferir sectionIds. */
  sectionId?: string | null;
  /** Subconjunto de ids a generar (intersección con elegibles). */
  sectionIds?: string[] | null;
  /** Tope de secciones a generar en esta llamada (serverless-safe). Sin tope si omitido. */
  maxSections?: number | null;
};

export async function generateProposalSectionsBatch(
  args: GenerateBatchArgs,
): Promise<{
  content: ProposalContentV2;
  progress: GenerateProgress;
  remainingSectionIds: string[];
}> {
  const {
    content,
    tenantId,
    quote,
    fixedSections,
    positions,
    corpus,
    onlyMissing,
    sectionId,
    sectionIds,
    maxSections,
  } = args;
  let next = content;
  const gaps: string[] = [];
  const progress: GenerateProgress = { generated: 0, failed: 0, skipped: 0 };

  const idFilter =
    sectionIds && sectionIds.length
      ? new Set(sectionIds)
      : sectionId
        ? new Set([sectionId])
        : null;

  const ordered = [...next.sections].sort((a, b) => a.order - b.order);
  const targets = ordered.filter((section) => (idFilter ? idFilter.has(section.id) : true));

  // Elegibles = las que realmente se generarían (no auto / no skipped por onlyMissing)
  const eligible = targets.filter((section) => {
    if (isAutoSection(section)) return false;
    if (onlyMissing && !isMissingGeneratableSection(section)) return false;
    return true;
  });

  const limit =
    maxSections != null && Number.isFinite(maxSections) && maxSections > 0
      ? Math.floor(maxSections)
      : null;
  const batchIds = new Set(
    limit != null ? eligible.slice(0, limit).map((s) => s.id) : eligible.map((s) => s.id),
  );
  const remainingSectionIds =
    limit != null ? eligible.slice(limit).map((s) => s.id) : [];

  for (const original of targets) {
    if (isAutoSection(original)) {
      progress.skipped += 1;
      continue;
    }

    if (onlyMissing && !isMissingGeneratableSection(original)) {
      progress.skipped += 1;
      continue;
    }

    // Fuera del cupo de esta llamada (quedan en remaining)
    if (!batchIds.has(original.id)) {
      continue;
    }

    // Dotación siempre desde puestos/servicios del costeo — nunca desde fijas.
    if (isDotacionSection(original)) {
      next = setSectionContent(next, original.id, buildDotacionContent(positions), {
        sources: ["puestos"],
        mark: "ia",
      });
      const updated = next.sections.find((section) => section.id === original.id);
      if (updated) updated.origin = "auto";
      progress.generated += 1;
      continue;
    }

    const fixed = findFixedSectionMatch(
      original.title,
      fixedSections,
      original.origin === "fija_empresa",
    );
    if (fixed) {
      next = setSectionContent(next, original.id, fixed.content, {
        sources: [`fija:${fixed.key}`],
        mark: "ia",
      });
      const updated = next.sections.find((section) => section.id === original.id);
      if (updated) updated.origin = "fija_empresa";
      progress.generated += 1;
      continue;
    }

    const generated = await generateProposalSection({
      tenantId,
      section: original,
      corpus,
      cpq: {
        code: quote.code,
        name: quote.name,
        clientName: quote.clientName,
        staffingSummary: `${quote.totalGuards} guardias / ${quote.totalPositions} puestos`,
      },
      mode: content.mode,
    });
    const previous =
      original.invariant === "exclusiones" &&
      !isPlaceholderExclusionesContent(original.content)
        ? original.content.trim()
        : "";
    const generatedBody =
      previous && !generated.content.includes(previous)
        ? [previous, generated.content.trim()].filter(Boolean).join("\n\n")
        : generated.content;
    next = setSectionContent(next, original.id, generatedBody, {
      sources: generated.sources,
      mark: generated.fallback ? undefined : "ia",
    });
    const updated = next.sections.find((section) => section.id === original.id);
    if (updated && !generated.fallback) {
      updated.origin = content.mode === "licitacion" ? "bases" : "ia";
      updated.ref = generated.ref;
    }
    gaps.push(...generated.gaps);
    if (generated.fallback) progress.failed += 1;
    else progress.generated += 1;
  }

  next = appendGenerationGaps(next, gaps);
  return { content: next, progress, remainingSectionIds };
}
