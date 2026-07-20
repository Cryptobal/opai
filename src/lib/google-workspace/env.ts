/** Helpers de env con degradación elegante (patrón trimEnv). */

export function trimEnv(v: string | undefined): string | undefined {
  return v?.trim() || undefined;
}

export function googleClientId(): string | undefined {
  return trimEnv(process.env.GOOGLE_CLIENT_ID);
}

export function googleClientSecret(): string | undefined {
  return trimEnv(process.env.GOOGLE_CLIENT_SECRET);
}

export function tokenSecret(): string {
  return trimEnv(process.env.GMAIL_TOKEN_SECRET) || "dev-secret";
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
