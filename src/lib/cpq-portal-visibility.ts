import type { Prisma } from "@prisma/client";

/**
 * Reglas de listado en el portal del cliente (prospecto/cliente).
 * - false: nunca mostrar (aunque esté enviada).
 * - true: mostrar (incluye borrador si se deja visible al editar).
 * - null: comportamiento anterior — visible si el estado no es borrador.
 */
export function cpqQuoteListedInClientPortalWhere(): Prisma.CpqQuoteWhereInput {
  return {
    OR: [
      { visibleInClientPortal: true },
      { visibleInClientPortal: null, status: { not: "draft" } },
    ],
  };
}

export function isCpqQuoteListedInClientPortal(quote: {
  visibleInClientPortal: boolean | null;
  status: string;
}): boolean {
  if (quote.visibleInClientPortal === false) return false;
  if (quote.visibleInClientPortal === true) return true;
  return quote.status !== "draft";
}
