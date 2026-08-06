/**
 * Variantes textuales de un RUT en la cartola del tenant.
 * Agrupa por descripción normalizada (merchant-key, sin corte de tokens).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { extractAllCanonicalRutsFromBankText } from "./rut-extract";
import { normalizeRutForMatch } from "./rut-normalize";
import { normalizeMerchantText } from "./merchant-key";
import { validateRut } from "@/lib/access-control/utils";

const VARIANT_CAP = 50;
const SCAN_CAP = 8000;

export interface RutVariantRow {
  /** Forma textual representativa (glosa original más frecuente). */
  sampleDescription: string;
  /** Clave de agrupación (glosa normalizada). */
  normalizedKey: string;
  count: number;
  totalAmountAbs: number;
  /** Si alguno de los RUT canónicos pedidos aparece en esa glosa. */
  captured: boolean;
}

export interface RutVariantsResult {
  ruts: string[];
  variants: RutVariantRow[];
  scanned: number;
  reachedCap: boolean;
}

function groupKey(description: string): string {
  return normalizeMerchantText(description).replace(/\s+/g, " ").trim();
}

/**
 * Dado uno o más RUT canónicos, lista las formas distintas en que aparecen
 * en description/reference de la cartola (cap 50 variantes).
 */
export async function listRutVariantsInCartola(
  tenantId: string,
  rawRuts: string[],
): Promise<RutVariantsResult> {
  const ruts = [
    ...new Set(
      rawRuts
        .map((r) => normalizeRutForMatch(r))
        .filter((r) => {
          if (r.length < 8) return false;
          const body = r.slice(0, -1);
          const dv = r.slice(-1);
          return validateRut(`${body}-${dv}`);
        }),
    ),
  ];
  if (ruts.length === 0) {
    return { ruts: [], variants: [], scanned: 0, reachedCap: false };
  }

  const expected = new Set(ruts);
  const txs = await prisma.financeBankTransaction.findMany({
    where: { tenantId, hiddenAt: null },
    select: {
      id: true,
      description: true,
      reference: true,
      amount: true,
    },
    orderBy: [{ transactionDate: "desc" }, { id: "asc" }],
    take: SCAN_CAP,
  });

  type Acc = {
    sampleDescription: string;
    count: number;
    totalAmountAbs: number;
    captured: boolean;
  };
  const byKey = new Map<string, Acc>();

  for (const tx of txs) {
    const found = new Set([
      ...extractAllCanonicalRutsFromBankText(tx.description),
      ...extractAllCanonicalRutsFromBankText(tx.reference),
    ]);
    const hit = [...expected].some((e) => found.has(e));
    if (!hit) continue;

    const key = groupKey(tx.description || tx.reference || "");
    if (!key) continue;
    const prev = byKey.get(key);
    const amountAbs = Math.abs(Number(tx.amount));
    if (!prev) {
      byKey.set(key, {
        sampleDescription: tx.description || tx.reference || key,
        count: 1,
        totalAmountAbs: amountAbs,
        captured: true,
      });
    } else {
      prev.count += 1;
      prev.totalAmountAbs += amountAbs;
    }
  }

  const variants = [...byKey.entries()]
    .map(([normalizedKey, v]) => ({
      normalizedKey,
      sampleDescription: v.sampleDescription,
      count: v.count,
      totalAmountAbs: v.totalAmountAbs,
      captured: v.captured,
    }))
    .sort((a, b) => b.count - a.count || b.totalAmountAbs - a.totalAmountAbs)
    .slice(0, VARIANT_CAP);

  return {
    ruts,
    variants,
    scanned: txs.length,
    reachedCap: txs.length >= SCAN_CAP,
  };
}
