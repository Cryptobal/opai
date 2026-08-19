/**
 * generate_missing al crear cotización / hija de bundle.
 * Primera tanda serverless-safe: fijas + Dotación + Gantt + exclusiones, luego el resto.
 */
import { loadQuoteProposal, saveQuoteProposal } from "@/lib/cpq/proposal-sections/persist";
import {
  generateProposalSectionsBatch,
  isDotacionSection,
  isMissingGeneratableSection,
} from "@/lib/cpq/proposal-sections/generate-batch";
import type { ProposalSection } from "@/lib/cpq/proposal-sections/schema";
import {
  ensureFixedSectionsSeeded,
  listFixedSections,
} from "@/lib/cpq/fixed-sections";
import { loadDotacionPositions } from "@/lib/cpq/proposal-sections/build-dotacion";
import {
  buildLicitacionCorpus,
  licitacionGenerationGate,
} from "@/modules/crm/documents/licitacion-ingest.service";

/** Primera tanda al crear: cubre fijas + Gantt + exclusiones sin bloquear el POST. */
export const CREATE_GENERATE_MAX_SECTIONS = 12;

export function prioritizeMissingSectionIds(
  sections: readonly ProposalSection[],
): string[] {
  const missing = sections.filter(isMissingGeneratableSection);
  const rank = (section: ProposalSection): number => {
    if (isDotacionSection(section)) return 0;
    if (section.origin === "fija_empresa") return 1;
    if (/\bgantt\b/i.test(section.title)) return 2;
    if (section.invariant === "exclusiones") return 3;
    return 4;
  };
  return [...missing]
    .sort((a, b) => rank(a) - rank(b) || a.order - b.order)
    .map((section) => section.id);
}

export async function generateMissingProposalSectionsForQuote(
  tenantId: string,
  quoteId: string,
  opts?: { maxSections?: number },
): Promise<{
  generated: number;
  failed: number;
  skipped: number;
  remaining: number;
} | null> {
  try {
    const { quote, content } = await loadQuoteProposal({ tenantId, quoteId });

    let corpus: Awaited<ReturnType<typeof buildLicitacionCorpus>> | null = null;
    if (content.mode === "licitacion") {
      if (!quote.dealId) {
        return { generated: 0, failed: 0, skipped: 0, remaining: 0 };
      }
      corpus = await buildLicitacionCorpus(tenantId, quote.dealId);
      const gate = licitacionGenerationGate(corpus.hasBases, corpus.basesError);
      if (gate) {
        return { generated: 0, failed: 0, skipped: 0, remaining: 0 };
      }
    }

    const prioritized = prioritizeMissingSectionIds(content.sections);
    if (prioritized.length === 0) {
      return { generated: 0, failed: 0, skipped: 0, remaining: 0 };
    }

    const max = opts?.maxSections ?? CREATE_GENERATE_MAX_SECTIONS;
    const sectionIds = prioritized.slice(0, max);
    const leftover = prioritized.slice(max);

    await ensureFixedSectionsSeeded(tenantId);
    const fixedSections = await listFixedSections(tenantId, { activeOnly: true });
    const positions = await loadDotacionPositions(quoteId);

    const batch = await generateProposalSectionsBatch({
      content,
      tenantId,
      quote,
      fixedSections,
      positions,
      corpus,
      onlyMissing: true,
      sectionIds,
    });

    await saveQuoteProposal({ tenantId, quoteId, content: batch.content });
    return {
      generated: batch.progress.generated,
      failed: batch.progress.failed,
      skipped: batch.progress.skipped,
      remaining: leftover.length + batch.remainingSectionIds.length,
    };
  } catch (error) {
    console.error("[proposal] generate_missing for quote:", error);
    return null;
  }
}

/** Fire-and-forget: no bloquea el create. El editor cubre lo que quede pendiente. */
export function scheduleGenerateMissingProposalSections(
  tenantId: string,
  quoteId: string,
): void {
  void generateMissingProposalSectionsForQuote(tenantId, quoteId);
}
