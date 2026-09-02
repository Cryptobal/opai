/**
 * Mensajes y presets de la pantalla /opai/login.
 * Centralizado para que el client y los tests compartan el contrato de `?error=`.
 */

export function erpLoginErrorMessage(error: string | undefined): string {
  switch (error) {
    case "CredentialsSignin":
      return "Email o contraseña incorrectos.";
    case "not_registered":
      return "Este correo no tiene usuario en el ERP. Si entras con Google, usa la misma cuenta de Workspace que está registrada.";
    case "google_not_registered":
      return "Tu cuenta de Google aún no está registrada en Opai.";
    case "tenant_suspended":
      return "Tu empresa tiene el acceso suspendido. Contacta a soporte.";
    case "Configuration":
    case "Callback":
    case "CallbackRouteError":
    case "OAuthCallback":
    case "OAuthSignin":
      return "No se pudo completar el acceso con Google. Volvé a intentar.";
    default:
      return "Error al iniciar sesión.";
  }
}

/** Evita meter basura / PII no-email en `?email=` tras un redirect de login. */
export function safeLoginEmailPreset(raw: string | null | undefined): string {
  if (!raw) return "";
  const value = raw.trim();
  if (value.length < 3 || value.length > 320) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "";
  return value;
}
