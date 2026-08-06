/**
 * Guards puros para el auto-enriquecimiento de empresas.
 * Separados de `company-enrich.ts` para poder testearlos sin cargar sharp/OpenAI.
 */

import { cleanRut, isValidRut } from "@/lib/chile-rut";

export const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.es",
  "outlook.com",
  "outlook.es",
  "yahoo.com",
  "yahoo.es",
  "live.com",
  "live.cl",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "mail.com",
  "aol.com",
  "zoho.com",
  "yandex.com",
  "tutanota.com",
]);

/** True si el dominio del email es de correo personal / free-mail. */
export function isGenericEmailDomain(email: string | null | undefined): boolean {
  if (!email) return false;
  const domain = email.split("@")[1]?.toLowerCase()?.trim();
  return Boolean(domain && GENERIC_EMAIL_DOMAINS.has(domain));
}

/**
 * True si el string parece un RUT chileno (válido o casi: solo dígitos+DV).
 * Evita usar "65192734k" como nombre de empresa para descubrir sitios web.
 */
export function looksLikeChileanRut(value: string | null | undefined): boolean {
  const raw = (value || "").trim();
  if (!raw) return false;
  if (isValidRut(raw)) return true;
  const clean = cleanRut(raw);
  // 7–8 dígitos + DV (aunque el DV no calce): típico de RUT pegado como nombre.
  return /^\d{7,8}[\dK]$/.test(clean);
}

/**
 * Nombre usable para descubrir el sitio web de una empresa.
 * Rechaza vacíos, RUTs y tokens demasiado cortos / solo numéricos.
 */
export function isUsableCompanyNameForWebDiscovery(name: string | null | undefined): boolean {
  const trimmed = (name || "").trim();
  if (trimmed.length < 3) return false;
  if (looksLikeChileanRut(trimmed)) return false;
  // Solo dígitos / puntuación → no es nombre comercial.
  if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(trimmed)) return false;
  return true;
}

/** Deriva un sitio web (https) desde el dominio de un email corporativo. */
export function websiteFromEmail(email: string | null | undefined): string {
  if (!email) return "";
  const domain = email.split("@")[1]?.toLowerCase()?.trim();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return "";
  return `https://${domain}`;
}
