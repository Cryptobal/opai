/**
 * Normalizadores/validadores de campo compartidos cliente ↔ servidor.
 * Firma uniforme: (raw) → { ok, value, note? } | { ok: false, error }.
 */

import { cleanRut, formatRut, isValidRut, toSiiRut } from "@/lib/chile-rut";

export type NormalizeOk = {
  ok: true;
  value: string | null;
  /** Nota cuando el valor guardado difiere del tecleado (p.ej. https:// agregado). */
  note?: string;
};

export type NormalizeErr = { ok: false; error: string };

export type NormalizeResult = NormalizeOk | NormalizeErr;

/** Vacío → null (nunca ""). */
function emptyToNull(raw: string): string | null {
  const s = raw.trim();
  return s === "" ? null : s;
}

/**
 * Replica la lógica de createAccountSchema.website:
 * - vacío → null
 * - ya tiene http(s):// → tal cual
 * - matchea dominio → antepone https://
 * - resto → error
 */
export function normalizeWebsite(raw: string): NormalizeResult {
  const s = emptyToNull(raw);
  if (s == null) return { ok: true, value: null };

  if (/^https?:\/\//i.test(s)) {
    if (!/^https?:\/\/[^\s]+$/i.test(s)) {
      return { ok: false, error: "URL inválida" };
    }
    return { ok: true, value: s };
  }

  if (/^[a-z0-9][-a-z0-9.]*\.[a-z]{2,}/i.test(s)) {
    const value = `https://${s}`;
    return { ok: true, value, note: `Se guardó como ${value}` };
  }

  return { ok: false, error: "URL inválida" };
}

/**
 * Normaliza RUT al formato canónico con puntos para display
 * (`76.123.456-7`). Vacío → null. Inválido → error.
 * Persistencia SII (`11111111-1`) la hace el schema vía toSiiRut.
 */
export function normalizeRut(raw: string): NormalizeResult {
  const s = emptyToNull(raw);
  if (s == null) return { ok: true, value: null };

  if (!isValidRut(s)) {
    return { ok: false, error: "RUT inválido" };
  }

  const formatted = formatRut(s);
  const cleaned = cleanRut(s);
  const note =
    formatted.replace(/\./g, "").toUpperCase() !== cleaned.toUpperCase() ||
    s.replace(/\s/g, "") !== formatted
      ? `Se guardó como ${formatted}`
      : undefined;

  // El valor de retorno para UI es formateado; el schema Zod aplica toSiiRut al persistir.
  return { ok: true, value: formatted, note };
}

/** RUT en formato SII (sin puntos) para envío al API. */
export function rutForApi(raw: string | null): string | null {
  if (raw == null || raw.trim() === "") return null;
  return toSiiRut(raw);
}

export function normalizeEmail(raw: string): NormalizeResult {
  const s = emptyToNull(raw);
  if (s == null) return { ok: true, value: null };

  const lower = s.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
    return { ok: false, error: "Email inválido" };
  }
  const note = lower !== s ? `Se guardó como ${lower}` : undefined;
  return { ok: true, value: lower, note };
}

/**
 * Teléfono Chile:
 * - 9 dígitos (móvil) → `+56 9 XXXX XXXX`
 * - 11 con prefijo 56 → normalizado
 * - vacío → null
 */
export function normalizePhoneCl(raw: string): NormalizeResult {
  const s = emptyToNull(raw);
  if (s == null) return { ok: true, value: null };

  const digits = s.replace(/\D/g, "");

  let national: string | null = null;
  if (digits.length === 9 && digits.startsWith("9")) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith("56") && digits[2] === "9") {
    national = digits.slice(2);
  } else if (digits.length === 8) {
    // Fijo sin código de área — no normalizamos a formato móvil
    return { ok: true, value: s };
  } else {
    return { ok: false, error: "Teléfono inválido (usa 9 dígitos o +56 9…)" };
  }

  const formatted = `+56 ${national[0]} ${national.slice(1, 5)} ${national.slice(5)}`;
  const note = formatted.replace(/\s/g, "") !== `+56${national}` || s !== formatted
    ? `Se guardó como ${formatted}`
    : undefined;
  return { ok: true, value: formatted, note };
}

/**
 * Celular Chile en formato Personas/API (`912345678`, 9 dígitos sin +56).
 * Acepta `+56 9…` / `569…` / `9XXXXXXXX` y vacía → null.
 */
export function normalizeMobileCl9(raw: string): NormalizeResult {
  const s = emptyToNull(raw);
  if (s == null) return { ok: true, value: null };

  const digits = s.replace(/\D/g, "");
  let national: string | null = null;
  if (digits.length === 9 && digits.startsWith("9")) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith("56") && digits[2] === "9") {
    national = digits.slice(2);
  } else {
    return { ok: false, error: "Celular inválido (9 dígitos, ej: 912345678)" };
  }

  const note =
    s.replace(/\D/g, "") !== national ? `Se guardó como ${national}` : undefined;
  return { ok: true, value: national, note };
}

export function normalizeIntRange(min: number, max: number) {
  return (raw: string): NormalizeResult => {
    const s = emptyToNull(raw);
    if (s == null) return { ok: true, value: null };

    const n = Number(s.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      return { ok: false, error: "Debe ser un número entero" };
    }
    if (n < min || n > max) {
      return { ok: false, error: `Debe estar entre ${min} y ${max}` };
    }
    return { ok: true, value: String(n) };
  };
}

/** Money CLP: acepta `$1.234.567` / `1234567` → string de enteros sin formato. */
export function normalizeMoneyClp(raw: string): NormalizeResult {
  const s = emptyToNull(raw);
  if (s == null) return { ok: true, value: null };

  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return { ok: false, error: "Monto inválido" };
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: "Monto inválido" };
  }
  return { ok: true, value: String(Math.round(n)) };
}

/** Fecha YYYY-MM-DD o vacío → null. */
export function normalizeDateYmd(raw: string): NormalizeResult {
  const s = emptyToNull(raw);
  if (s == null) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { ok: false, error: "Fecha inválida (YYYY-MM-DD)" };
  }
  const d = new Date(`${s}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Fecha inválida" };
  }
  return { ok: true, value: s };
}
