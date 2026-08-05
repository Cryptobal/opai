const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valida formato UUID v1-v5. Devuelve false para null/undefined/"". */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/**
 * UUID isomórfico (cliente + servidor). No usar `node:crypto` en módulos
 * compartidos con el browser: en Safari/WebView iOS el import queda
 * `undefined` y revienta con `randomUUID is not a function`.
 */
export function newUuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}
