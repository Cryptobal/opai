import "server-only";
import { validateRut } from "@/lib/access-control/utils";
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

/** Con guión explícito y/o puntos (evita comerse sólo dígitos al azar). */
const RUT_FORMATTED_REGEX =
  /\b\d{1,2}\.\d{3}\.\d{3}\s*-\s*[\dkK]\b|\b\d{7,8}\s*-\s*[\dkK]\b/gi;

type RutHit = { canon: string; index: number };

/**
 * Intenta interpretar `slice` como cuerpo+RUT en un solo bloque de dígitos
 * (cartolas: "0799324601 Transf...", sin guión).
 */
function tryDenseDigitRutAt(
  digitRun: string,
  runStartInText: number,
  i: number,
  len: number,
): RutHit | null {
  const slice = digitRun.slice(i, i + len);
  if (slice.length < 8) return null;
  const body = slice.slice(0, -1);
  const dv = slice.slice(-1).toUpperCase();
  const bodyTrim = body.replace(/^0+/, "") || "0";
  const candidate = `${bodyTrim}-${dv}`;
  if (!validateRut(candidate)) return null;
  return {
    canon: normalizeRutForMatch(candidate),
    index: runStartInText + i,
  };
}

/**
 * Glosas típicamente traen el RUT al **inicio** ("0799324601 Transf...")
 * o inmediatamente antes de marcas tipo Transf/TEF — no barremos cualquier
 * carrera de dígitos (folios de 10 cifras pueden pasar DV por casualidad).
 */
function collectAnchoredDenseRutHits(text: string): RutHit[] {
  const hits: RutHit[] = [];
  const trimmed = text.trimStart();
  const indexOffset = text.length - trimmed.length;

  /** Ventanas válidas dentro de una sola carrera anclada. */
  function scanRun(run: string, runStartInText: number) {
    for (let i = 0; i <= run.length - 8; i++) {
      for (let len = 8; len <= Math.min(10, run.length - i); len++) {
        const h = tryDenseDigitRutAt(run, runStartInText, i, len);
        if (h) hits.push(h);
      }
    }
  }

  const lead = trimmed.match(/^(\d{8,12})(?=\s|\D|$)/u);
  if (lead?.[1]) scanRun(lead[1], indexOffset + 0);

  const midNearTransfer =
    /\b(\d{9,11})\s*(?=Transf|TRANSF|TEF\b|INTERNET)/gi;
  let m: RegExpExecArray | null;
  while ((m = midNearTransfer.exec(trimmed)) !== null) {
    scanRun(m[1], indexOffset + m.index);
  }

  return hits;
}

/**
 * Extrae candidatos RUT con **dígito verificador válido** para no confundir folios
 * (p. ej. el viejo regex marcaba "079932460" frente a `0799324601` en glosa).
 *
 * Orden: aparece el de menor índice en el string. Expuesto para tests.
 */
export function extractCanonicalRutFromBankText(
  text: string | null | undefined,
): string | null {
  if (!text?.trim()) return null;
  const hits: RutHit[] = [];

  let fm: RegExpExecArray | null;
  const formatted = new RegExp(RUT_FORMATTED_REGEX.source, RUT_FORMATTED_REGEX.flags);
  while ((fm = formatted.exec(text)) !== null) {
    const raw = fm[0];
    const normalized = normalizeRutForMatch(raw);
    if (normalized.length < 8 || normalized.length > 9) continue;
    const body = normalized.slice(0, -1);
    const dv = normalized.slice(-1);
    const bodyTrim = body.replace(/^0+/, "") || "0";
    const candidate = `${bodyTrim}-${dv}`;
    if (!validateRut(candidate)) continue;
    hits.push({
      canon: normalizeRutForMatch(candidate),
      index: fm.index,
    });
  }

  for (const h of collectAnchoredDenseRutHits(text)) {
    hits.push(h);
  }

  if (hits.length === 0) return null;

  const byCanon = new Map<string, number>();
  for (const h of hits) {
    const prev = byCanon.get(h.canon);
    if (prev === undefined || h.index < prev) byCanon.set(h.canon, h.index);
  }
  const sorted = [...byCanon.entries()].sort((a, b) => a[1] - b[1]);
  return sorted[0]?.[0] ?? null;
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
