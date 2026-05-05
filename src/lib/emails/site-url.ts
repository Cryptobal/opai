/**
 * URL base canónica para enlaces dentro de emails.
 *
 * Reglas:
 * 1. Nunca apunta a un dominio obsoleto (ej. opai.gard.cl).
 * 2. Si se conoce el slug del tenant, devuelve `https://{slug}.opai.cl` (multi-tenant subdomain).
 * 3. Si no, fallback a `https://www.opai.cl`.
 * 4. Permite override vía env var explícito (`PUBLIC_APP_URL`) — útil para staging/preview.
 *
 * Importante: el logo del email debe usar `getEmailLogoUrl()` (URL absoluta a www),
 * NO la base del tenant — los archivos estáticos solo viven en el dominio principal.
 */
const CANONICAL_BASE = "https://www.opai.cl";

export function getCanonicalSiteUrl(): string {
  const env =
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL;

  if (env) {
    const cleaned = env.replace(/\/$/, "");
    if (/(\.|^)gard\.cl(\/|$)/.test(cleaned)) return CANONICAL_BASE;
    return cleaned;
  }
  return CANONICAL_BASE;
}

/**
 * URL del tenant para deeplinks (CTA "Ver en OPAI").
 * Si tenantSlug viene, devuelve subdomain. Si no, canónico.
 */
export function getTenantSiteUrl(tenantSlug?: string | null): string {
  if (tenantSlug && /^[a-z0-9-]+$/.test(tenantSlug)) {
    return `https://${tenantSlug}.opai.cl`;
  }
  return getCanonicalSiteUrl();
}

/**
 * Base URL para emails enviados desde código que no usa templates React.
 * Acepta un override explícito (ej. `request.headers.get('origin')`) y por
 * último cae al canónico — NUNCA al obsoleto opai.gard.cl.
 */
export function getEmailBaseUrl(
  override?: string | null,
  tenantSlug?: string | null,
): string {
  if (override && /^https?:\/\//.test(override)) {
    const cleaned = override.replace(/\/+$/, "");
    if (!/(\.|^)gard\.cl(\/|$)/.test(cleaned)) return cleaned;
  }
  return getTenantSiteUrl(tenantSlug);
}

/**
 * Resuelve URL absoluta para un link relativo dentro de un email.
 * - Si link ya es http(s), se devuelve tal cual.
 * - Si es ruta absoluta (/...) y hay tenantSlug, se prefija con subdomain del tenant.
 * - Si no hay tenantSlug, se prefija con canónico.
 */
export function buildEmailUrl(link: string, tenantSlug?: string | null): string {
  if (!link) return getTenantSiteUrl(tenantSlug);
  if (link.startsWith("http://") || link.startsWith("https://")) return link;
  const base = getTenantSiteUrl(tenantSlug);
  return link.startsWith("/") ? `${base}${link}` : `${base}/${link}`;
}

/**
 * URL absoluta del logo a mostrar en emails. Siempre desde el dominio canónico,
 * porque /public/* solo se sirve desde www, no desde subdominios de tenant.
 */
export function getEmailLogoUrl(): string {
  return `${CANONICAL_BASE}/logo-email.png`;
}

/**
 * URL para el link "Administrar notificaciones" (preferencias del usuario).
 * Siempre debe abrir en el subdomain del tenant para que el login funcione.
 */
export function getNotificationPrefsUrl(
  tenantSlug?: string | null,
  notificationType?: string,
): string {
  const base = getTenantSiteUrl(tenantSlug);
  const path = `/opai/perfil/notificaciones${notificationType ? `?type=${encodeURIComponent(notificationType)}` : ""}`;
  return `${base}${path}`;
}
