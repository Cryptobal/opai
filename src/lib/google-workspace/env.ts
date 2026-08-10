/** Helpers de env con degradación elegante (patrón trimEnv). */

import { getGmailTokenSecret } from "@/lib/crypto";
import { normalisePrivateKey } from "./private-key";

export function trimEnv(v: string | undefined): string | undefined {
  return v?.trim() || undefined;
}

let saKeyWarned = false;

/** Email de la cuenta de servicio global de Drive (GOOGLE_DRIVE_SA_CLIENT_EMAIL). */
export function driveServiceAccountEmail(): string | undefined {
  return trimEnv(process.env.GOOGLE_DRIVE_SA_CLIENT_EMAIL);
}

/**
 * Private key PEM de la cuenta de servicio (GOOGLE_DRIVE_SA_PRIVATE_KEY).
 * Nunca loguear el valor.
 */
export function driveServiceAccountKey(): string | undefined {
  const key = normalisePrivateKey(process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY);
  if (!key || !key.includes("-----BEGIN")) {
    if (!saKeyWarned && process.env.GOOGLE_DRIVE_SA_PRIVATE_KEY) {
      saKeyWarned = true;
      console.warn(
        "[google-workspace] GOOGLE_DRIVE_SA_PRIVATE_KEY presente pero no es un PEM válido tras normalización",
      );
    }
    return undefined;
  }
  return key;
}

export function googleClientId(): string | undefined {
  return trimEnv(process.env.GOOGLE_CLIENT_ID);
}

export function googleClientSecret(): string | undefined {
  return trimEnv(process.env.GOOGLE_CLIENT_SECRET);
}

// Fail-closed: sin GMAIL_TOKEN_SECRET no se firman ni descifran tokens
// (aquí no aplica la degradación elegante — un secreto por defecto permitiría
// forjar firmas HMAC y descifrar tokens persistidos). Se conserva el trim
// histórico de este módulo: sus tokens se cifraron con el valor trimmed.
export function tokenSecret(): string {
  return getGmailTokenSecret().trim();
}

export function driveRedirectUri(): string | undefined {
  return trimEnv(process.env.GOOGLE_DRIVE_REDIRECT_URI);
}

export function calendarRedirectUri(): string | undefined {
  return trimEnv(process.env.GOOGLE_CALENDAR_REDIRECT_URI);
}

export function calendarWebhookUrl(): string | undefined {
  return trimEnv(process.env.GOOGLE_CALENDAR_WEBHOOK_URL);
}
