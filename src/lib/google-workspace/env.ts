/** Helpers de env con degradación elegante (patrón trimEnv). */

import { getGmailTokenSecret } from "@/lib/crypto";

export function trimEnv(v: string | undefined): string | undefined {
  return v?.trim() || undefined;
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
