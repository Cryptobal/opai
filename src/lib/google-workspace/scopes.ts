export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"] as const;

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
] as const;

/**
 * Verifica que el `scope` devuelto por Google (string separado por espacios)
 * incluya TODOS los scopes requeridos. Si el usuario destildó algún permiso en
 * la pantalla de consentimiento, el grant queda incompleto y hay que rechazarlo.
 */
export function grantIncludesScopes(
  granted: string | null | undefined,
  required: readonly string[],
): boolean {
  if (!granted) return false;
  const set = new Set(granted.split(/\s+/).filter(Boolean));
  return required.every((s) => set.has(s));
}
