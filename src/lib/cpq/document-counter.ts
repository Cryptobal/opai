/**
 * Contador atómico de correlativos CPQ por tenant + año.
 * Formato: CPQ-YYYY-NNN | PROP-YYYY-NNN (padStart 3, sin truncar >999).
 */

import type { Prisma } from "@prisma/client";

export type DocumentCounterKind = "quote" | "bundle";

type Tx = Prisma.TransactionClient;

const PREFIX: Record<DocumentCounterKind, string> = {
  quote: "CPQ",
  bundle: "PROP",
};

export function formatDocumentCode(
  kind: DocumentCounterKind,
  year: number,
  n: number,
): string {
  return `${PREFIX[kind]}-${year}-${String(n).padStart(3, "0")}`;
}

/**
 * Obtiene el siguiente código dentro de la transacción del caller.
 * El correlativo nunca retrocede (aunque se borren registros).
 * Ante carrera en el create, reintenta una vez con increment.
 */
export async function nextDocumentCode(
  tx: Tx,
  tenantId: string,
  kind: DocumentCounterKind,
  year: number = new Date().getFullYear(),
): Promise<string> {
  const whereUnique = { tenantId_kind_year: { tenantId, kind, year } };

  try {
    const row = await tx.cpqDocumentCounter.upsert({
      where: whereUnique,
      create: { tenantId, kind, year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    return formatDocumentCode(kind, year, row.lastNumber);
  } catch (err: unknown) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code: string }).code
        : "";
    if (code === "P2002") {
      const row = await tx.cpqDocumentCounter.update({
        where: whereUnique,
        data: { lastNumber: { increment: 1 } },
      });
      return formatDocumentCode(kind, year, row.lastNumber);
    }
    throw err;
  }
}
