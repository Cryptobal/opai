/**
 * URL base canónica para enlaces dentro de emails.
 *
 * NOTA HISTÓRICA (mayo 2026): el modelo "un subdomain por tenant"
 * (`{slug}.opai.cl`) fue DESCARTADO porque DNS para `*.opai.cl` nunca
 * estuvo configurado en producción (sólo `www`, `app` y `api` resuelven).
 * Como consecuencia, todos los emails que apuntaban a `gard.opai.cl/...`
 * llegaban a links rotos. Política nueva:
 *
 *  - Toda URL de email usa el dominio canónico (`https://www.opai.cl`).
 *  - Para rutas potencialmente públicas (`/portal/`, `/sign/`, `/p/`,
 *    `/r/`, `/registro-demo`, `/postulacion`, `/activate`, `/welcome`),
 *    se anexa `?tenant={slug}` (+ alias legacy `t={slug}`) para que el
 *    tenant-resolver pueda resolver el tenant sin sesión.
 *  - Para rutas autenticadas (`/ops/...`, `/opai/...`), la sesión
 *    NextAuth ya provee `session.user.tenantId`, no se necesita slug.
 *  - El logo del email usa el dominio canónico (los archivos estáticos
 *    sólo se sirven desde `www`).
 *
 * `getTenantSiteUrl` mantiene su firma por compatibilidad, pero ahora
 * ignora el slug y siempre retorna el canónico. Si en el futuro se
 * habilitan subdomains reales (wildcard DNS + cert), se puede re-añadir
 * la rama detrás de un flag (ej. `TENANT_SUBDOMAINS_ENABLED`).
 */
const CANONICAL_BASE = "https://www.opai.cl";

const PUBLIC_PATH_PREFIXES = [
  "/portal/",
  "/registro-demo",
  "/p/",
  "/r/",
  "/postulacion",
  "/activate",
  "/welcome",
  "/sign/",
];

const SLUG_RE = /^[a-z0-9-]+$/;

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
 * Compat: antes devolvía `https://{slug}.opai.cl`. Ahora siempre canónico
 * (DNS de subdominios por tenant no existe). El parámetro permanece por
 * compatibilidad de firma con call-sites existentes.
 */
export function getTenantSiteUrl(_tenantSlug?: string | null): string {
  return getCanonicalSiteUrl();
}

/**
 * Anexa `?tenant={slug}` (+ alias `t={slug}`) a `url` sólo si:
 *  - el slug es válido
 *  - la ruta es potencialmente pública (ver `PUBLIC_PATH_PREFIXES`)
 *  - el query string no ya define `tenant=` ni `t=`
 */
export function appendTenantQuery(
  url: string,
  tenantSlug?: string | null,
): string {
  if (!tenantSlug || !SLUG_RE.test(tenantSlug)) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const path = parsed.pathname;
  const isPublic = PUBLIC_PATH_PREFIXES.some(
    (p) => path === p || path.startsWith(p),
  );
  if (!isPublic) return url;
  if (parsed.searchParams.has("tenant") || parsed.searchParams.has("t")) {
    return url;
  }
  parsed.searchParams.set("tenant", tenantSlug);
  parsed.searchParams.set("t", tenantSlug);
  return parsed.toString();
}

/**
 * Base URL para emails enviados desde código que no usa templates React.
 * Acepta un override explícito (ej. `request.headers.get('origin')`).
 * Si el override es inválido o apunta a un dominio obsoleto (gard.cl),
 * cae al canónico. El tenantSlug ya no afecta la base (sólo se usa para
 * anexar `?tenant=` cuando se construyen URLs vía `buildEmailUrl`).
 */
export function getEmailBaseUrl(
  override?: string | null,
  _tenantSlug?: string | null,
): string {
  if (override && /^https?:\/\//.test(override)) {
    const cleaned = override.replace(/\/+$/, "");
    if (!/(\.|^)gard\.cl(\/|$)/.test(cleaned)) return cleaned;
  }
  return getCanonicalSiteUrl();
}

/**
 * Resuelve URL absoluta para un link dentro de un email.
 *  - Si link ya es absoluto (http/https), se devuelve tal cual.
 *  - Si es relativo, se prefija con el canónico.
 *  - Si la ruta resultante es pública y hay slug válido, se anexa
 *    `?tenant=slug` para que el tenant-resolver lo capte.
 */
export function buildEmailUrl(
  link: string,
  tenantSlug?: string | null,
): string {
  if (!link) return getCanonicalSiteUrl();
  if (link.startsWith("http://") || link.startsWith("https://")) return link;
  const base = getCanonicalSiteUrl();
  const absolute = link.startsWith("/") ? `${base}${link}` : `${base}/${link}`;
  return appendTenantQuery(absolute, tenantSlug);
}

/**
 * URL absoluta del logo a mostrar en emails. Siempre desde el dominio
 * canónico, porque /public/* sólo se sirve desde www.
 */
export function getEmailLogoUrl(): string {
  return `${CANONICAL_BASE}/logo-email.png`;
}

/**
 * URL para el link "Administrar notificaciones" (preferencias del usuario).
 * Es una ruta autenticada (`/opai/perfil/notificaciones`), por lo que la
 * sesión resolverá el tenant. Aún así se anexa `tenant={slug}` cuando
 * está disponible para facilitar logging/debugging — es inocuo si la
 * sesión activa pertenece al mismo tenant.
 */
export function getNotificationPrefsUrl(
  tenantSlug?: string | null,
  notificationType?: string,
): string {
  const base = getCanonicalSiteUrl();
  const params = new URLSearchParams();
  if (notificationType) params.set("type", notificationType);
  if (tenantSlug && SLUG_RE.test(tenantSlug)) {
    params.set("tenant", tenantSlug);
  }
  const qs = params.toString();
  return `${base}/opai/perfil/notificaciones${qs ? `?${qs}` : ""}`;
}
