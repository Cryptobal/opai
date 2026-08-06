/**
 * Extracción de RUT desde glosas bancarias (puro, sin prisma — usable en client).
 */
import { validateRut } from "@/lib/access-control/utils";
import { normalizeRutForMatch } from "./rut-normalize";

/** Con guión explícito y/o puntos (evita comerse sólo dígitos al azar). */
const RUT_FORMATTED_REGEX =
  /\b\d{1,2}\.\d{3}\.\d{3}\s*-\s*[\dkK]\b|\b\d{7,8}\s*-\s*[\dkK]\b/gi;

type RutHit = { canon: string; index: number; length: number };

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
    length: len,
  };
}

function tryAnchoredDensePrimaryRun(
  run: string,
  runStartInText: number,
): RutHit | null {
  const stripped = run.replace(/^0+/, "") || "0";
  if (stripped.length < 8 || stripped.length > 9) return null;
  const body = stripped.slice(0, -1);
  const dv = stripped.slice(-1).toUpperCase();
  const bodyTrim = body.replace(/^0+/, "") || "0";
  const candidate = `${bodyTrim}-${dv}`;
  if (!validateRut(candidate)) return null;
  const leadingZeros = run.length - stripped.length;
  return {
    canon: normalizeRutForMatch(candidate),
    index: runStartInText + leadingZeros,
    length: stripped.length,
  };
}

function collectAnchoredDenseRutHits(text: string): RutHit[] {
  const hits: RutHit[] = [];
  const trimmed = text.trimStart();
  const indexOffset = text.length - trimmed.length;

  function scanRun(run: string, runStartInText: number) {
    const primary = tryAnchoredDensePrimaryRun(run, runStartInText);
    if (primary) {
      hits.push(primary);
      return;
    }
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
 * Recolecta todos los hits de RUT válidos (formateados + densos anclados),
 * dedupeados por canónico, ordenados por aparición (índice, luego longitud).
 */
function collectCanonicalRutHits(text: string): RutHit[] {
  const hits: RutHit[] = [];

  let fm: RegExpExecArray | null;
  const formatted = new RegExp(
    RUT_FORMATTED_REGEX.source,
    RUT_FORMATTED_REGEX.flags,
  );
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
      length: raw.length,
    });
  }

  for (const h of collectAnchoredDenseRutHits(text)) {
    hits.push(h);
  }

  if (hits.length === 0) return [];

  const byCanon = new Map<string, { index: number; length: number }>();
  for (const h of hits) {
    const prev = byCanon.get(h.canon);
    if (
      prev === undefined ||
      h.index < prev.index ||
      (h.index === prev.index && h.length > prev.length)
    ) {
      byCanon.set(h.canon, { index: h.index, length: h.length });
    }
  }
  return [...byCanon.entries()]
    .sort((a, b) => {
      const ia = a[1].index;
      const ib = b[1].index;
      if (ia !== ib) return ia - ib;
      return b[1].length - a[1].length;
    })
    .map(([canon, meta]) => ({
      canon,
      index: meta.index,
      length: meta.length,
    }));
}

/**
 * Extrae todos los RUT canónicos válidos en texto de cartola, en orden de
 * aparición y sin duplicados. Una glosa con dos RUT distintos los devuelve
 * ambos (puede producir falsos positivos en reglas; la vista previa lo expone).
 */
export function extractAllCanonicalRutsFromBankText(
  text: string | null | undefined,
): string[] {
  if (!text?.trim()) return [];
  return collectCanonicalRutHits(text).map((h) => h.canon);
}

/**
 * Extrae el primer RUT canónico válido en texto de cartola (description/reference).
 */
export function extractCanonicalRutFromBankText(
  text: string | null | undefined,
): string | null {
  if (!text?.trim()) return null;
  return collectCanonicalRutHits(text)[0]?.canon ?? null;
}
