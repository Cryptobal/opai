/**
 * Escribe campos de escalera/vigencia respetando readsUnified().
 */

import { prisma } from "@/lib/prisma";
import { readsUnified } from "@/lib/docs/migration";

export async function writeExpiryFields(
  tenantId: string,
  kind: "operacional" | "guardia",
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  if (await readsUnified(tenantId)) {
    await prisma.documento.updateMany({ where: { id, tenantId }, data });
    return;
  }
  if (kind === "operacional") {
    await prisma.docOperacional.updateMany({ where: { id, tenantId }, data });
  } else {
    await prisma.opsDocumentoPersona.updateMany({ where: { id, tenantId }, data });
  }
}
