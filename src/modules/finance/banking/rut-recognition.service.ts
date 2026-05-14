import "server-only";
import { prisma } from "@/lib/prisma";
import { normalizeRutForMatch } from "./auto-match-payment.service";

export type RutMatchKind = "client" | "supplier" | "guardia" | "unknown";

export interface RutRecognition {
  /** RUT canónico detectado en el texto (dígitos + DV, lowercase, sin puntos/guion). */
  rut: string | null;
  kind: RutMatchKind;
  entityId: string | null;
  entityName: string | null;
}

// Regex chileno: 1-2 dígitos millones, 3-3-3 (con/sin puntos), guion opcional,
// dígito verificador (numérico o K). Acepta formatos con o sin puntos y guion.
const RUT_REGEX = /(\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK])/g;

/**
 * Extrae el primer RUT chileno presente en una cadena bancaria
 * (description o reference). Devuelve la forma canónica (lower, sin
 * puntos/guion) o null si no encuentra uno con 8-9 caracteres útiles.
 */
function extractRutFromText(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(RUT_REGEX);
  if (!matches) return null;
  for (const raw of matches) {
    const norm = normalizeRutForMatch(raw);
    // RUT chileno tiene 8 o 9 chars (rut+dv). Filtramos números cortos
    // que pueden ser folios, sucursales, etc.
    if (norm.length >= 8 && norm.length <= 9) return norm;
  }
  return null;
}

/**
 * Recibe N movimientos bancarios y devuelve un Map<txId, RutRecognition>.
 *
 * Estrategia:
 *  1. Extrae el primer RUT canónico de cada description/reference.
 *  2. Una sola query por tipo de entidad (CrmAccount, FinanceSupplier,
 *     OpsPersona via OpsGuardia) usando IN sobre los RUTs canónicos.
 *  3. Construye el resultado priorizando: client > supplier > guardia.
 *
 * Sin queries por-fila — N+1 evitado. Si el batch es la página visible
 * (e.g. 50 movs), una pasada por cada tabla resuelve todo.
 *
 * Prioridad cuando un mismo RUT calza en varias tablas: el cliente CRM
 * gana sobre proveedor y guardia. Documentado para que cambiar la
 * prioridad sea un cambio explícito.
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
      extractRutFromText(tx.description) ?? extractRutFromText(tx.reference);
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

  const rutList = Array.from(allRuts);

  // 2. Tres queries batch por tipo de entidad. Cada una devuelve {rut, id, name}
  //    y construimos índices por rut canónico para lookup O(1).
  const [accounts, suppliers, guardias] = await Promise.all([
    prisma.crmAccount.findMany({
      where: { tenantId, rut: { not: null } },
      select: { id: true, name: true, rut: true },
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

  // 3. Resolver cada tx con prioridad client > supplier > guardia.
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
