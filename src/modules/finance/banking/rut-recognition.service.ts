import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeRutForMatch } from "./auto-match-payment.service";
import { extractCanonicalRutFromBankText } from "./rut-extract";

export { extractCanonicalRutFromBankText } from "./rut-extract";

export type RutMatchKind =
  | "client"
  | "factoring"
  | "supplier"
  | "guardia"
  | "unknown";

export interface RutRecognition {
  /** RUT canónico detectado en el texto (dígitos + DV, lowercase, sin puntos/guion). */
  rut: string | null;
  kind: RutMatchKind;
  entityId: string | null;
  entityName: string | null;
}

/**
 * Recibe N movimientos bancarios y devuelve un Map<txId, RutRecognition>.
 *
 * Estrategia:
 *  1. Extrae el primer RUT canónico de cada description/reference.
 *  2. Queries batch por tipo (CrmAccount, FinanceFactoringCompany,
 *     FinanceSupplier, OpsGuardia) filtradas en memoria por los RUT detectados.
 *  3. Prioridad por tx: client > factoring > supplier > guardia > unknown.
 *
 * Sin queries por-fila — N+1 evitado. Si el batch es la página visible
 * (e.g. 50 movs), una pasada por cada tabla resuelve todo.
 *
 * Prioridad cuando un mismo RUT calza en varias tablas: cliente CRM gana;
 * si no hay cliente pero hay cesionario en catálogo de factoring, se marca
 * factoring antes que proveedor/guardia (un mismo RUT rara vez es cliente y
 * cesionario; si lo fuera, queda como cliente).
 */
export async function recognizeRutsForTransactions(
  tenantId: string,
  txs: Array<{
    id: string;
    description: string | null;
    reference: string | null;
  }>,
): Promise<Map<string, RutRecognition>> {
  const result = new Map<string, RutRecognition>();

  // 1. Extraer RUTs. Mapeamos por txId y mantenemos el set único para el query.
  const txToRut = new Map<string, string | null>();
  const allRuts = new Set<string>();
  for (const tx of txs) {
    const rut =
      extractCanonicalRutFromBankText(tx.description) ??
      extractCanonicalRutFromBankText(tx.reference);
    txToRut.set(tx.id, rut);
    if (rut) allRuts.add(rut);
  }

  // Default: todos arrancan como unknown sin RUT detectado.
  for (const tx of txs) {
    result.set(tx.id, {
      rut: txToRut.get(tx.id) ?? null,
      kind: "unknown",
      entityId: null,
      entityName: null,
    });
  }
  if (allRuts.size === 0) return result;

  // 2. Queries batch por tipo de entidad → índices por RUT canónico.
  const [accounts, factoringCompanies, suppliers, guardias] =
    await Promise.all([
      prisma.crmAccount.findMany({
        where: { tenantId, rut: { not: null } },
        select: { id: true, name: true, rut: true },
      }),
      prisma.financeFactoringCompany.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, razonSocial: true, rut: true },
      }),
      prisma.financeSupplier.findMany({
        where: { tenantId },
        select: { id: true, name: true, rut: true },
      }),
      prisma.opsGuardia.findMany({
        where: {
          tenantId,
          persona: { rut: { not: null } },
        },
        select: {
          id: true,
          persona: { select: { rut: true, firstName: true, lastName: true } },
        },
      }),
    ]);

  // Filtramos los que efectivamente matchean alguno de los RUTs detectados.
  // Hacemos el filtrado por rut canónico en memoria (los datos en BD pueden
  // estar con/sin puntos/guion). Para tablas grandes ya filtramos por
  // tenantId arriba — el N es del orden de cientos, manejable.
  const accountByRut = new Map<string, { id: string; name: string }>();
  for (const a of accounts) {
    const k = normalizeRutForMatch(a.rut);
    if (k && allRuts.has(k)) accountByRut.set(k, { id: a.id, name: a.name });
  }
  const factoringByRut = new Map<string, { id: string; name: string }>();
  for (const f of factoringCompanies) {
    const k = normalizeRutForMatch(f.rut);
    if (k && allRuts.has(k))
      factoringByRut.set(k, { id: f.id, name: f.razonSocial });
  }
  const supplierByRut = new Map<string, { id: string; name: string }>();
  for (const s of suppliers) {
    const k = normalizeRutForMatch(s.rut);
    if (k && allRuts.has(k))
      supplierByRut.set(k, { id: s.id, name: s.name });
  }
  const guardiaByRut = new Map<string, { id: string; name: string }>();
  for (const g of guardias) {
    const k = normalizeRutForMatch(g.persona.rut);
    if (!k || !allRuts.has(k)) continue;
    const name = `${g.persona.firstName ?? ""} ${g.persona.lastName ?? ""}`
      .trim();
    guardiaByRut.set(k, { id: g.id, name: name || "Guardia" });
  }

  // 3. Resolver cada tx: client > factoring > supplier > guardia.
  for (const tx of txs) {
    const rut = txToRut.get(tx.id);
    if (!rut) continue;
    const client = accountByRut.get(rut);
    if (client) {
      result.set(tx.id, {
        rut,
        kind: "client",
        entityId: client.id,
        entityName: client.name,
      });
      continue;
    }
    const factoring = factoringByRut.get(rut);
    if (factoring) {
      result.set(tx.id, {
        rut,
        kind: "factoring",
        entityId: factoring.id,
        entityName: factoring.name,
      });
      continue;
    }
    const supplier = supplierByRut.get(rut);
    if (supplier) {
      result.set(tx.id, {
        rut,
        kind: "supplier",
        entityId: supplier.id,
        entityName: supplier.name,
      });
      continue;
    }
    const guardia = guardiaByRut.get(rut);
    if (guardia) {
      result.set(tx.id, {
        rut,
        kind: "guardia",
        entityId: guardia.id,
        entityName: guardia.name,
      });
      continue;
    }
    // unknown: RUT detectado pero sin contraparte. result ya está seteado
    // con kind=unknown desde el default.
  }

  return result;
}
