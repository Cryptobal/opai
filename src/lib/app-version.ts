/**
 * Versión de software visible (Res. Exenta N°38 Art. 17 c).
 * Preferir NEXT_PUBLIC_APP_VERSION (inyectada en el build);
 * fallback al SHA corto de Vercel o a package.json.
 */

const PACKAGE_VERSION = "0.1.0";

export function getAppVersion(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  if (explicit) return explicit;

  const sha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha && sha.length >= 7) return `${PACKAGE_VERSION}+${sha.slice(0, 7)}`;

  return PACKAGE_VERSION;
}
