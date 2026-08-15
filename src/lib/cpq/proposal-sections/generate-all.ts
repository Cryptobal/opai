/**
 * Generación masiva de secciones de propuesta institucional.
 * Fijas → biblioteca tenant; Dotación → puestos CPQ; resto → IA.
 */
import { prisma } from "@/lib/prisma";
import {
  ensureFixedSectionsSeeded,
  listFixedSections,
} from "@/lib/cpq/fixed-sections";
import {
  DOTACION_KIND,
  OFERTA_ECONOMICA_KIND,
  type ProposalContentV2,
  type ProposalSection,
} from "./schema";
import { setSectionContent } from "./ops";
import { isAutoSection } from "./oferta-economica";
import { generateProposalSection } from "./generate-section";
import type { CpqIndexContext } from "./propose-index";
import type { LicitacionCorpus } from "@/modules/crm/documents/licitacion-ingest.service";

export function needsCommercialAutogen(content: ProposalContentV2): boolean {
  if (content.mode !== "comercial") return false;
  if (content.generating) return false;
  if (content.status === "enviada" || content.status === "aprobada") return false;
  return content.sections.some((s) => {
    if (isAutoSection(s)) return false;
    if (s.origin === "fija_empresa" && s.content.trim()) return false;
    if (s.kind === DOTACION_KIND && s.content.trim()) return false;
    if (s.invariant === "exclusiones" && s.content.trim() && s.content !== "Pendiente de completar.") {
      return false;
    }
    // IA vacía o fijas aún sin contenido de biblioteca
    return !s.content.trim() || s.content === "Pendiente de completar.";
  });
}

export async function buildDotacionContent(opts: {
  tenantId: string;
  quoteId: string;
}): Promise<string> {
  const positions = await prisma.cpqPosition.findMany({
    where: { quoteId: opts.quoteId, quote: { tenantId: opts.tenantId } },
    include: {
      cargo: { select: { name: true } },
      rol: { select: { name: true } },
      puestoTrabajo: { select: { name: true } },
      serviceGroup: { select: { name: true, coveragePattern: true } },
    },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  if (positions.length === 0) {
    return "Sin puestos cotizados aún. La dotación se completará cuando se agreguen posiciones al costeo.";
  }

  const lines = positions.map((p, i) => {
    const name = p.customName || p.puestoTrabajo?.name || `Puesto ${i + 1}`;
    const cargo = p.cargo?.name ?? "—";
    const rol = p.rol?.name ?? "—";
    const guards = p.numGuards;
    const puestos = p.numPuestos ?? 1;
    const group = p.serviceGroup?.name
      ? ` · Grupo: ${p.serviceGroup.name}${p.serviceGroup.coveragePattern ? ` (${p.serviceGroup.coveragePattern})` : ""}`
      : "";
    const hours =
      p.startTime && p.endTime ? ` · Turno ${p.startTime}–${p.endTime}` : "";
    return `${i + 1}. ${name}: ${guards} guardia(s) × ${puestos} puesto(s) — Cargo: ${cargo}, Rol/turno: ${rol}${hours}${group}`;
  });

  return [
    "Dotación propuesta según el costeo vigente de la cotización:",
    "",
    ...lines,
    "",
    "La dotación definitiva se confirma en la adjudicación y puede ajustarse por instalación.",
  ].join("\n");
}

export async function applyFixedLibraryContent(
  tenantId: string,
  content: ProposalContentV2,
): Promise<ProposalContentV2> {
  await ensureFixedSectionsSeeded(tenantId);
  const library = await listFixedSections(tenantId, { activeOnly: true });
  const byKey = new Map(library.map((r) => [r.key, r]));
  let next = content;
  for (const s of content.sections) {
    if (s.origin !== "fija_empresa" || !s.fixedKey) continue;
    const row = byKey.get(s.fixedKey);
    if (!row) continue;
    next = {
      ...next,
      sections: next.sections.map((x) =>
        x.id === s.id
          ? {
              ...x,
              title: row.title,
              content: row.content,
              sources: ["biblioteca"],
              status: x.status === "aprobada" ? "editada" : "ia",
            }
          : x,
      ),
    };
  }
  return next;
}

export async function generateAllSections(opts: {
  tenantId: string;
  quoteId: string;
  content: ProposalContentV2;
  cpq: CpqIndexContext;
  corpus: LicitacionCorpus | null;
  instruction?: string;
  onlySectionId?: string;
}): Promise<ProposalContentV2> {
  let next = await applyFixedLibraryContent(opts.tenantId, opts.content);

  const targets = next.sections.filter((s) => {
    if (opts.onlySectionId) return s.id === opts.onlySectionId;
    if (isAutoSection(s)) return false;
    if (s.invariant === "matriz") return false;
    return true;
  });

  for (const section of targets) {
    if (section.kind === DOTACION_KIND || section.origin === "auto" && section.kind === DOTACION_KIND) {
      const body = await buildDotacionContent({
        tenantId: opts.tenantId,
        quoteId: opts.quoteId,
      });
      next = setSectionContent(next, section.id, body, {
        sources: ["costeo", "puestos"],
        mark: "ia",
      });
      continue;
    }

    if (section.origin === "fija_empresa" && section.content.trim() && !opts.instruction && !opts.onlySectionId) {
      // Ya copiada de biblioteca
      continue;
    }

    if (section.kind === DOTACION_KIND) {
      const body = await buildDotacionContent({
        tenantId: opts.tenantId,
        quoteId: opts.quoteId,
      });
      next = setSectionContent(next, section.id, body, {
        sources: ["costeo", "puestos"],
        mark: "ia",
      });
      continue;
    }

    const generated = await generateProposalSection({
      tenantId: opts.tenantId,
      section,
      instruction: opts.instruction,
      corpus: opts.corpus,
      cpq: opts.cpq,
      mode: next.mode,
    });
    next = setSectionContent(next, section.id, generated.content, {
      sources: generated.sources.length ? generated.sources : section.sources,
      mark: generated.fallback ? undefined : "ia",
    });
    if (generated.ref) {
      next = {
        ...next,
        sections: next.sections.map((s) =>
          s.id === section.id ? { ...s, ref: generated.ref } : s,
        ),
      };
    }

    // Acumular gaps en Exclusiones
    if (generated.gaps.length) {
      const excl = next.sections.find((s) => s.invariant === "exclusiones");
      if (excl) {
        const gapBlock = generated.gaps.map((g) => `• ${g}`).join("\n");
        const note = `Huecos detectados al generar «${section.title}»:\n${gapBlock}`;
        if (!excl.content.includes(gapBlock)) {
          next = setSectionContent(
            next,
            excl.id,
            [excl.content.trim(), note].filter(Boolean).join("\n\n"),
            { mark: "ia" },
          );
        }
      }
    }
  }

  // Dotación si quedó vacía
  const dot = next.sections.find((s) => s.kind === DOTACION_KIND);
  if (dot && !dot.content.trim()) {
    const body = await buildDotacionContent({
      tenantId: opts.tenantId,
      quoteId: opts.quoteId,
    });
    next = setSectionContent(next, dot.id, body, {
      sources: ["costeo", "puestos"],
      mark: "ia",
    });
  }

  return { ...next, generating: false };
}

export function markSectionGenerating(
  content: ProposalContentV2,
  sectionIds?: string[],
): ProposalContentV2 {
  const ids = sectionIds ? new Set(sectionIds) : null;
  return {
    ...content,
    generating: true,
    sections: content.sections.map((s) => {
      if (isAutoSection(s)) return s;
      if (ids && !ids.has(s.id)) return s;
      if (s.origin === "fija_empresa" && s.content.trim()) return s;
      return s;
    }),
  };
}

export type { ProposalSection };
