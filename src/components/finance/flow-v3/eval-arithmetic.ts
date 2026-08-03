/**
 * Evaluador aritmético seguro para el editor de celda.
 * Solo acepta expresiones que empiezan con `=` y contienen
 * dígitos, operadores + - * / ( ), punto/coma decimal y espacios.
 * Sin identificadores ni referencias a celdas.
 */

const EXPR_BODY = /^[0-9+\-*/(). ,]+$/;

/** Normaliza es-CL: quita puntos de miles, coma → punto decimal. */
export function normalizeArithmeticBody(raw: string): string {
  // Quitar espacios. En es-CL: `.` = miles, `,` = decimal.
  // Sin coma, todos los puntos entre dígitos son separadores de miles
  // (salvo un único punto con 1–2 dígitos finales → decimal anglosajón, ej. 24.5).
  let s = raw.replace(/\s+/g, "");
  if (s.includes(",")) {
    return s.replace(/\./g, "").replace(",", ".");
  }
  // Reemplazar puntos de miles dentro de literales numéricos, preservando operadores.
  return s.replace(/\d[\d.]*\d|\d+/g, (num) => {
    const parts = num.split(".");
    if (parts.length === 1) return num;
    if (parts.length === 2) {
      const frac = parts[1]!;
      // Un solo punto + 1–2 dígitos → decimal (24.5); 3 dígitos → miles (1.000).
      if (frac.length <= 2) return num;
      return parts.join("");
    }
    const last = parts[parts.length - 1]!;
    if (last.length <= 2 && /^\d+$/.test(last)) {
      return parts.slice(0, -1).join("") + "." + last;
    }
    return parts.join("");
  });
}

export type EvalArithmeticResult =
  | { ok: true; value: number }
  | { ok: false; reason: string };

/**
 * Si `raw` empieza con `=`, evalúa el resto. Si no, retorna null (no es fórmula).
 */
export function tryEvalArithmetic(raw: string): EvalArithmeticResult | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("=")) return null;
  const body = trimmed.slice(1).trim();
  if (!body) return { ok: false, reason: "Expresión vacía" };
  if (!EXPR_BODY.test(body)) {
    return { ok: false, reason: "Solo números y + − × ÷ ( )" };
  }
  const normalized = normalizeArithmeticBody(body);
  if (!/^[0-9+\-*/().]+$/.test(normalized)) {
    return { ok: false, reason: "Expresión inválida" };
  }
  // Rechazar secuencias peligrosas residuales (letras ya bloqueadas).
  if (/[a-zA-Z_$]/.test(normalized)) {
    return { ok: false, reason: "Expresión inválida" };
  }
  try {
    // eslint-disable-next-line no-new-func -- body ya validado con whitelist estricta
    const result = Function(`"use strict"; return (${normalized});`)() as unknown;
    if (typeof result !== "number" || !Number.isFinite(result)) {
      return { ok: false, reason: "Resultado no numérico" };
    }
    return { ok: true, value: Math.round(result) };
  } catch {
    return { ok: false, reason: "No se pudo evaluar" };
  }
}
