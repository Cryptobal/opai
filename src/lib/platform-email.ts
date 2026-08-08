/**
 * Identidad de correo de plataforma (fallback neutro multi-tenant).
 *
 * La identidad de cada tenant vive en Setting (`empresa.emailFrom` /
 * `empresa.emailFromName` / `empresa.emailReplyTo`). Estas constantes
 * solo aplican cuando un tenant aún no tiene settings propias, o como
 * último recurso en catch de getTenantEmailConfig.
 */

export const PLATFORM_DEFAULT_EMAIL_FROM_ADDRESS =
  process.env.PLATFORM_DEFAULT_EMAIL_FROM_ADDRESS || "noreply@opai.cl";

export const PLATFORM_DEFAULT_EMAIL_FROM_NAME = "OPAI";

export const PLATFORM_DEFAULT_EMAIL_FROM = `${PLATFORM_DEFAULT_EMAIL_FROM_NAME} <${PLATFORM_DEFAULT_EMAIL_FROM_ADDRESS}>`;

export function splitEmailFrom(value: string): { name: string; address: string } {
  const trimmed = (value || "").trim();
  if (!trimmed) {
    return { name: "", address: "" };
  }
  const match = trimmed.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].trim().replace(/^["']|["']$/g, ""),
      address: match[2].trim(),
    };
  }
  if (trimmed.includes("@")) {
    return { name: "", address: trimmed };
  }
  return { name: trimmed, address: "" };
}
