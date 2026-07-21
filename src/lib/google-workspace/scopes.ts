/**
 * Scopes de identidad necesarios para resolver el email de la cuenta
 * (oauth2.userinfo.get). Sin ellos el intercambio de token no autoriza
 * la lectura del perfil → 401 "missing required authentication credential".
 */
const IDENTITY_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
] as const;

export const DRIVE_SCOPES = [
  ...IDENTITY_SCOPES,
  "https://www.googleapis.com/auth/drive.file",
] as const;

export const CALENDAR_SCOPES = [
  ...IDENTITY_SCOPES,
  "https://www.googleapis.com/auth/calendar.events",
  // calendarList.list (multi-calendario de la agenda) NO está cubierto por
  // calendar.events — requiere lectura de calendarios. Sin este scope, los
  // tokens solo-events caen al fallback primary de google-events.ts.
  "https://www.googleapis.com/auth/calendar.readonly",
] as const;

/**
 * Verifica que el `scope` devuelto por Google (string separado por espacios)
 * incluya los scopes requeridos. Google normaliza los scopes de identidad de
 * forma inconsistente (p. ej. devuelve `openid` y a veces la forma corta
 * `email`/`profile` en vez de la URL completa de `userinfo.*`), por lo que
 * esos se validan por sufijo. Los scopes funcionales (calendar/drive) se
 * exigen de forma exacta: si el usuario destildó uno, el grant se rechaza.
 */
export function grantIncludesScopes(
  granted: string | null | undefined,
  required: readonly string[],
): boolean {
  if (!granted) return false;
  const set = new Set(granted.split(/\s+/).filter(Boolean));
  const isIdentity = (s: string) =>
    s === "openid" || s.includes("userinfo.email") || s.includes("userinfo.profile");
  return required.every((s) => {
    if (!isIdentity(s)) return set.has(s);
    if (s === "openid") return set.has("openid");
    const short = s.endsWith("email") ? "email" : "profile";
    return set.has(s) || set.has(short);
  });
}
