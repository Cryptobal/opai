/**
 * Hidrata secciones vacías hidratables (fija_empresa + Dotación) antes de
 * renderizar el PDF. Evita capítulos solo-título cuando el usuario descarga
 * sin haber corrido generate_all / generate_missing.
 */
import type { ProposalContentV2 } from "@/lib/cpq/proposal-sections/schema";
import { setSectionContent } from "@/lib/cpq/proposal-sections/ops";
import { isAutoSection } from "@/lib/cpq/proposal-sections/oferta-economica";
import {
  findFixedSectionMatch,
  isDotacionSection,
  type FixedSectionRow,
} from "@/lib/cpq/proposal-sections/generate-batch";
import {
  buildDotacionContent,
  buildDotacionContentForInstallations,
  isEmptyDotacionContent,
  type DotacionInstallationBlock,
  type DotacionPosition,
} from "@/lib/cpq/proposal-sections/build-dotacion";
import {
  ensureFixedSectionsSeeded,
  listFixedSections,
} from "@/lib/cpq/fixed-sections";

export type HydrateForPdfArgs = {
  content: ProposalContentV2;
  fixedSections: readonly FixedSectionRow[];
  /** Dotación mono-instalación (quote). Ignorado si `installations` tiene ítems. */
  positions?: readonly DotacionPosition[];
  /** Dotación multi-instalación (bundle). */
  installations?: readonly DotacionInstallationBlock[];
};

export type HydrateForPdfResult = {
  content: ProposalContentV2;
  /** true si se rellenó al menos una sección vacía. */
  changed: boolean;
  hydratedSectionIds: string[];
};

function shouldHydrateDotacion(section: { content: string }): boolean {
  return isEmptyDotacionContent(section.content);
}

function shouldHydrateFixed(section: {
  content: string;
  origin?: string;
  status?: string;
}): boolean {
  if (section.content.trim()) return false;
  // No pisar ediciones manuales vacías deliberadas.
  if (section.status === "editada") return false;
  return (
    section.origin === "fija_empresa" ||
    section.origin === "vacia" ||
    !section.origin
  );
}

/**
 * Rellena en memoria Dotación + secciones fijas vacías.
 * No llama IA (Gantt / resumen quedan para generate o se omiten en render).
 */
export function hydrateProposalContentForPdf(
  args: HydrateForPdfArgs,
): HydrateForPdfResult {
  let next = args.content;
  const hydratedSectionIds: string[] = [];
  const ordered = [...next.sections].sort((a, b) => a.order - b.order);

  for (const original of ordered) {
    if (isAutoSection(original)) continue;

    if (isDotacionSection(original)) {
      if (!shouldHydrateDotacion(original)) continue;
      const body =
        args.installations && args.installations.length > 0
          ? buildDotacionContentForInstallations(args.installations)
          : buildDotacionContent(args.positions ?? []);
      next = setSectionContent(next, original.id, body, {
        sources: ["puestos"],
        mark: "ia",
      });
      const updated = next.sections.find((s) => s.id === original.id);
      if (updated) updated.origin = "auto";
      hydratedSectionIds.push(original.id);
      continue;
    }

    if (!shouldHydrateFixed(original)) continue;

    const fixed = findFixedSectionMatch(
      original.title,
      args.fixedSections,
      original.origin === "fija_empresa",
    );
    if (!fixed?.content?.trim()) continue;

    next = setSectionContent(next, original.id, fixed.content, {
      sources: [`fija:${fixed.key}`],
      mark: "ia",
    });
    const updated = next.sections.find((s) => s.id === original.id);
    if (updated) updated.origin = "fija_empresa";
    hydratedSectionIds.push(original.id);
  }

  return {
    content: next,
    changed: hydratedSectionIds.length > 0,
    hydratedSectionIds,
  };
}

/** Carga biblioteca fija del tenant (seed si está vacía) y hidrata. */
export async function hydrateProposalContentForPdfWithTenant(opts: {
  tenantId: string;
  content: ProposalContentV2;
  positions?: readonly DotacionPosition[];
  installations?: readonly DotacionInstallationBlock[];
}): Promise<HydrateForPdfResult> {
  await ensureFixedSectionsSeeded(opts.tenantId);
  const rows = await listFixedSections(opts.tenantId, { activeOnly: true });
  const fixedSections: FixedSectionRow[] = rows.map((row) => ({
    key: row.key,
    title: row.title,
    content: row.content,
  }));
  return hydrateProposalContentForPdf({
    content: opts.content,
    fixedSections,
    positions: opts.positions,
    installations: opts.installations,
  });
}

/** Stub comercial de exclusiones: cuenta como “sin contenido” para el gate final. */
export function isPlaceholderExclusionesContent(content: string): boolean {
  const t = content.trim().toLowerCase();
  if (!t) return true;
  return (
    t === "pendiente de completar." ||
    t === "pendiente de completar" ||
    t.startsWith("pendiente: se completará")
  );
}
