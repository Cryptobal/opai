/**
 * Borrado de cotización — mismo camino que DELETE /api/cpq/quotes/[id]:
 * impacto + bloqueos, papelera restaurable (`deleteQuoteToTrash`), propuesta vacía.
 */
import { prisma } from "@/lib/prisma";
import { buildQuoteDeleteImpact, type QuoteDeleteBlocker } from "@/modules/cpq/quote-delete-impact";
import { deleteQuoteToTrash } from "@/modules/cpq/quote-trash.service";
import { ensureBundleNotEmpty } from "@/modules/cpq/bundles/bundle.service";

export type ExecuteQuoteDeleteResult =
  | {
      ok: true;
      trashId: string;
      bundleDeleted: boolean;
      code: string;
      name: string | null;
    }
  | {
      ok: false;
      status: 404 | 409;
      error: string;
      blockers?: QuoteDeleteBlocker[];
    };

export async function executeQuoteDelete(opts: {
  tenantId: string;
  userId: string;
  quoteId: string;
  force?: boolean;
  reason?: string | null;
}): Promise<ExecuteQuoteDeleteResult> {
  const { tenantId, userId, quoteId } = opts;
  const force = Boolean(opts.force);
  const reason = opts.reason?.trim() || null;

  const impact = await buildQuoteDeleteImpact(tenantId, quoteId);
  if (!impact) {
    return { ok: false, status: 404, error: "Quote not found" };
  }

  if (impact.blockers.length > 0 && !force) {
    return {
      ok: false,
      status: 409,
      error: "La cotización tiene dependencias que impiden eliminarla directamente",
      blockers: impact.blockers,
    };
  }

  const result = await prisma.$transaction(async (tx) => {
    const trash = await deleteQuoteToTrash({
      tx,
      tenantId,
      quoteId,
      userId,
      reason,
    });
    let bundleDeleted = false;
    if (trash.bundleId) {
      const state = await ensureBundleNotEmpty({
        tx,
        tenantId,
        bundleId: trash.bundleId,
      });
      bundleDeleted = state.bundleDeleted;
    }
    return { trashId: trash.trashId, bundleDeleted };
  });

  return {
    ok: true,
    trashId: result.trashId,
    bundleDeleted: result.bundleDeleted,
    code: impact.quote.code,
    name: impact.quote.name,
  };
}
