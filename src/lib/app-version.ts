/**
 * Versión de software visible (Res. Exenta N°38 Art. 17 c).
 * Preferir NEXT_PUBLIC_APP_VERSION; fallback a package.json y SHA de Vercel.
 */

export const PROVIDER_LEGAL_NAME = "Opai SpA";
export const PROVIDER_SOFTWARE_NAME = "OPAI";
export const PROVIDER_DISPLAY_NAME = "Opai SpA — OPAI";
export const FISCALIZACION_DT_PATH = "/fiscalizacion-dt";
export const FISCALIZACION_DT_PUBLIC_URL = "https://www.opai.cl/fiscalizacion-dt";

export function getAppVersion(): string {
  const version =
    process.env.NEXT_PUBLIC_APP_VERSION?.trim() ||
    process.env.npm_package_version?.trim() ||
    "0.1.0";
  const sha = (
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    ""
  ).trim();
  if (sha.length >= 7) return `${version} (${sha.slice(0, 7)})`;
  return version;
}

export function getProviderVersionLine(): string {
  return `${PROVIDER_DISPLAY_NAME} v${getAppVersion()}`;
}
