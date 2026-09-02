/**
 * Resolución de Admin ERP para Google Sign-In.
 *
 * El lookup por email solo no basta: si alguien renombra el correo del
 * Admin (p.ej. a un alias interno) el Google Workspace sigue enviando el
 * email original. El portal unificado ya matchea por `googleId`; el
 * provider de NextAuth tiene que hacer lo mismo.
 */

export type GoogleAdminLookup = {
  email?: string | null;
  googleSub?: string | null;
};

export function normalizeGoogleEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Orden de match:
 *  1. email Google == Admin.email (activo)
 *  2. sub de Google == Admin.googleId (activo)
 *
 * Nunca mezcla un Admin encontrado por email con otro encontrado por
 * googleId: el email gana, para no cruzar cuentas si el sub quedó huérfano.
 */
export function googleAdminLookupPlan(input: GoogleAdminLookup): {
  email: string | null;
  googleSub: string | null;
} {
  const email = normalizeGoogleEmail(input.email);
  const googleSub = input.googleSub?.trim() || null;
  return {
    email: email.length > 0 ? email : null,
    googleSub,
  };
}
