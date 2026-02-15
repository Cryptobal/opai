/**
 * DTE PDF Service
 * Generate and retrieve PDF for DTE documents
 */

import { prisma } from "@/lib/prisma";
import { getDteProvider } from "../shared/adapters/dte-provider.adapter";

/**
 * Get or generate PDF for a DTE
 */
export async function getDtePdf(tenantId: string, dteId: string): Promise<Buffer> {
  const dte = await prisma.financeDte.findFirst({
    where: { id: dteId, tenantId },
    include: { lines: true },
  });
  if (!dte) throw new Error("DTE no encontrado");

  const provider = getDteProvider();
  return provider.getPdf(dte.dteType, dte.folio);
}
