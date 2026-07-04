/**
 * Título de modal seguro para Slack (Fase 14).
 *
 * Slack RECHAZA un `views.open`/`push`/`update` con `invalid_arguments` (sin más
 * detalle) si el `title.text` supera 24 caracteres. Los builders usaban `pt()`
 * que corta a 75 → títulos con `code`/nombres largos ("Aplazar SLA TK-12345",
 * "Pendientes de mi aprobación") reventaban el modal en silencio y "el botón no
 * hacía nada". Esta utilidad COMPARTIDA garantiza ≤24 con corte visible "…".
 */

export const SLACK_MODAL_TITLE_MAX = 24;

/** Recorta a ≤24 chars con "…" si sobra. Idempotente y sin deps. */
export function clampModalTitle(text: string): string {
  const t = (text ?? "").trim();
  if (t.length <= SLACK_MODAL_TITLE_MAX) return t;
  return `${t.slice(0, SLACK_MODAL_TITLE_MAX - 1)}…`;
}

/** Elemento plain_text listo para el campo `title` de un modal (ya clampeado). */
export function modalTitle(text: string): { type: "plain_text"; text: string } {
  return { type: "plain_text", text: clampModalTitle(text) };
}

/** Lee el `title.text` de un view (para logs de diagnóstico). undefined si no hay. */
export function readViewTitle(view: unknown): string | undefined {
  const t = (view as { title?: { text?: unknown } } | null)?.title?.text;
  return typeof t === "string" ? t : undefined;
}

/**
 * Red de seguridad en el choke-point de la API: clampa el `title.text` de un
 * view ANTES de enviarlo, sin depender de que cada builder lo hiciera. Devuelve
 * el mismo objeto (mutado) para no romper referencias.
 */
export function clampViewTitle<T>(view: T): T {
  const v = view as { title?: { text?: unknown } } | null;
  if (v?.title && typeof v.title.text === "string") {
    v.title.text = clampModalTitle(v.title.text);
  }
  return view;
}
