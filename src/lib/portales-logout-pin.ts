export const LEGACY_LOGOUT_PIN_KEY = "portales.logoutPin";
export const FALLBACK_LOGOUT_PIN = "0000";

export const PIN_NOT_CONFIGURED_MESSAGE =
  "Este equipo no tiene el PIN de empresa. Prueba 0000 o vuelve a vincular el dispositivo.";

export type LogoutPinSetting = {
  key: string;
  value: string;
  tenantId?: string | null;
};

export type LogoutPinCheck =
  | { ok: true }
  | { ok: false; code: "PIN_MISMATCH" | "PIN_NOT_CONFIGURED"; error?: string };

export function empresaLogoutPinKey(tenantId: string): string {
  return `empresa:${tenantId}:${LEGACY_LOGOUT_PIN_KEY}`;
}

/** Keep digits only, max 4 chars — same regex as the config UI. */
export function normalizeLogoutPin(raw: string | null | undefined): string {
  if (raw == null) return "";
  return String(raw).replace(/[^0-9]/g, "").slice(0, 4);
}

export function isConfiguredLogoutPin(pin: string): boolean {
  return pin.length === 4;
}

/**
 * Prefer `empresa:{tenantId}:portales.logoutPin`, then legacy `portales.logoutPin`.
 * `preferredTenantIds` are tried in order (installation tenant, then device tenant).
 */
export function pickLogoutPinValue(
  settings: LogoutPinSetting[],
  preferredTenantIds: string[] = [],
): string {
  const candidates = settings
    .map((s) => ({
      key: s.key,
      tenantId: s.tenantId ?? null,
      pin: normalizeLogoutPin(s.value),
    }))
    .filter((s) => isConfiguredLogoutPin(s.pin));

  if (candidates.length === 0) return "";

  const prefixedKey = (tenantId: string) => empresaLogoutPinKey(tenantId);

  for (const tenantId of preferredTenantIds) {
    const hit = candidates.find((s) => s.key === prefixedKey(tenantId));
    if (hit) return hit.pin;
  }

  for (const tenantId of preferredTenantIds) {
    const hit = candidates.find(
      (s) => s.key === LEGACY_LOGOUT_PIN_KEY && s.tenantId === tenantId,
    );
    if (hit) return hit.pin;
  }

  const anyPrefixed = candidates.find((s) =>
    s.key.endsWith(`:${LEGACY_LOGOUT_PIN_KEY}`),
  );
  if (anyPrefixed) return anyPrefixed.pin;

  const legacyScoped = candidates.find((s) => s.key === LEGACY_LOGOUT_PIN_KEY && s.tenantId);
  if (legacyScoped) return legacyScoped.pin;

  const legacyGlobal = candidates.find(
    (s) => s.key === LEGACY_LOGOUT_PIN_KEY && s.tenantId == null,
  );
  if (legacyGlobal) return legacyGlobal.pin;

  return candidates[0]?.pin ?? "";
}

/**
 * Match a submitted PIN against a configured value.
 * If nothing is configured, do not silently compare against 0000:
 * return PIN_NOT_CONFIGURED, unless the user explicitly typed 0000
 * (documented fallback in the error copy).
 */
export function evaluateLogoutPin(
  configured: string,
  submitted: string,
): LogoutPinCheck {
  const pin = normalizeLogoutPin(configured);
  const attempt = normalizeLogoutPin(submitted);

  if (isConfiguredLogoutPin(pin)) {
    if (attempt.length === 4 && attempt === pin) return { ok: true };
    return { ok: false, code: "PIN_MISMATCH" };
  }

  if (attempt === FALLBACK_LOGOUT_PIN) return { ok: true };

  return {
    ok: false,
    code: "PIN_NOT_CONFIGURED",
    error: PIN_NOT_CONFIGURED_MESSAGE,
  };
}
