/**
 * Derivación de patrón de comerciante desde glosa bancaria.
 * Puro (sin prisma / server-only) — usable en cliente vía unmatched-count.
 */

export const MERCHANT_NEEDLE_MIN_LEN = 4;

export interface MerchantKey {
  key: string;
  needle: string;
  label: string;
}

/** Prefijos/verbos bancarios al inicio (orden: frases más largas primero). */
const LEADING_BANK_PREFIXES = [
  "TRANSFERENCIA A",
  "TRANSFERENCIA DE",
  "PAGO DE",
  "TRANSFERENCIA",
  "SUSCRIPCION",
  "SERVICIO",
  "COMPRA",
  "PAGO",
  "CARGO",
  "ABONO",
  "TRF",
  "TEF",
  "PAC",
  "PAT",
  "GIRO",
  "RETIRO",
  "DEBITO",
  "CREDITO",
  "DE",
  "A",
] as const;

const FORBIDDEN_NEEDLES = new Set([
  "PAGO",
  "COMPRA",
  "CARGO",
  "ABONO",
  "TRANSFERENCIA",
  "BANCO",
  "SANTANDER",
  "INTERNET",
  "TARJETA",
  "CUENTA",
  "MENSUAL",
  "SERVICIOS",
  "VARIOS",
]);

/** Misma forma que rut-extract (candidatos RUT formateados; no valida DV). */
const RUT_CANDIDATE_REGEX =
  /\b\d{1,2}\.\d{3}\.\d{3}\s*-\s*[\dkK]\b|\b\d{7,8}\s*-\s*[\dkK]\b/gi;

const DENSE_DIGIT_RUN_REGEX = /\d{7,}/g;
const DATE_TOKEN_REGEX = /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$/;
const NON_ALNUM_SPLIT = /[^A-Z0-9]+/;

export function normalizeMerchantText(raw: string): string {
  return raw
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function isForbiddenNeedle(needle: string): boolean {
  const n = normalizeMerchantText(needle).trim();
  return FORBIDDEN_NEEDLES.has(n);
}

function stripRutCandidatesAndDenseDigits(text: string): string {
  return text
    .replace(RUT_CANDIDATE_REGEX, " ")
    .replace(DENSE_DIGIT_RUN_REGEX, " ");
}

function stripLeadingBankPrefixes(text: string): string {
  let s = text.trim().replace(/\s+/g, " ");
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of LEADING_BANK_PREFIXES) {
      if (s === prefix || s.startsWith(`${prefix} `)) {
        s = s.slice(prefix.length).trim();
        changed = true;
        break;
      }
    }
  }
  return s;
}

function significantTokens(text: string): string[] {
  return text
    .split(NON_ALNUM_SPLIT)
    .filter((tok) => {
      if (!tok) return false;
      if (/^\d+$/.test(tok)) return false;
      if (DATE_TOKEN_REGEX.test(tok)) return false;
      if (tok.length <= 2) return false;
      return true;
    });
}

/**
 * Deriva un needle de comerciante desde la glosa.
 * Retorna null si no hay patrón usable (corto o genérico prohibido).
 */
export function deriveMerchantKey(label: string): MerchantKey | null {
  if (!label?.trim()) return null;
  let text = normalizeMerchantText(label);
  text = stripRutCandidatesAndDenseDigits(text);
  text = stripLeadingBankPrefixes(text);
  const tokens = significantTokens(text);
  if (tokens.length === 0) return null;

  let needle = tokens[0]!;
  let i = 1;
  while (needle.length < MERCHANT_NEEDLE_MIN_LEN && i < tokens.length) {
    needle = `${needle} ${tokens[i]!}`;
    i++;
  }

  if (needle.length < MERCHANT_NEEDLE_MIN_LEN) return null;
  if (isForbiddenNeedle(needle)) return null;

  return { key: `M:${needle}`, needle, label: needle };
}
