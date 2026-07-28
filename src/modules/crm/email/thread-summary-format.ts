/**
 * Normaliza el texto del resumen del hilo a viñetas legibles.
 * Puro, sin dependencias — no interpreta HTML ni usa dangerouslySetInnerHTML.
 */

export type SummaryLine = { text: string; emphasis: boolean };

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+/;
/** Encabezado markdown: `# Título` o solo `##` / `###`. */
const HEADING_RE = /^\s{0,3}#{1,6}(?:\s+.*)?$/;

/** Quita marcadores `**…**` y marca la línea si hubo énfasis. */
function stripBold(raw: string): { text: string; emphasis: boolean } {
  let emphasis = false;
  const text = raw.replace(/\*\*([^*]+)\*\*/g, (_m, inner: string) => {
    emphasis = true;
    return inner;
  });
  return { text: text.trim(), emphasis };
}

/**
 * Convierte el markdown/texto plano del modelo en líneas de viñeta.
 * Descarta vacíos y encabezados `#`; remueve viñetas/numeración iniciales.
 * Ante entrada vacía o solo espacios, devuelve [].
 * Ante texto sin estructura, degrada a una sola línea plana (nunca lanza).
 */
export function formatThreadSummary(raw: string): SummaryLine[] {
  if (typeof raw !== "string") return [];
  const lines = raw.split(/\r?\n/);
  const out: SummaryLine[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (HEADING_RE.test(trimmed)) continue;
    const withoutBullet = trimmed.replace(BULLET_RE, "");
    if (!withoutBullet.trim()) continue;
    const { text, emphasis } = stripBold(withoutBullet);
    if (!text) continue;
    out.push({ text, emphasis });
  }

  if (out.length === 0) {
    const flat = raw.replace(/\s+/g, " ").trim();
    if (!flat) return [];
    const { text, emphasis } = stripBold(flat);
    return text ? [{ text, emphasis }] : [];
  }

  return out;
}
