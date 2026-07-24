const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function normalizeEmailAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function extractEmailAddresses(value?: string | null): string[] {
  if (!value) return [];

  const matches = value.match(EMAIL_REGEX) || [];
  const normalized = matches
    .map((match) => normalizeEmailAddress(match))
    .filter(Boolean);

  return Array.from(new Set(normalized));
}

export function normalizeEmailList(values?: string[] | null): string[] {
  if (!values?.length) return [];

  const normalized: string[] = [];

  for (const value of values) {
    const extracted = extractEmailAddresses(value);
    if (extracted.length > 0) {
      normalized.push(...extracted);
      continue;
    }

    const fallback = normalizeEmailAddress(value);
    if (fallback) {
      normalized.push(fallback);
    }
  }

  return Array.from(new Set(normalized));
}

/**
 * Persiste el From de Gmail como `"Nombre" <email>` (o solo email) para que
 * la bandeja muestre el display name (p.ej. "OPAi app") y no solo la parte
 * local del noreply. Si no hay email parseable, usa `fallbackEmail`.
 */
export function formatFromHeaderForStorage(
  rawFrom: string | null | undefined,
  fallbackEmail: string,
): string {
  const email =
    extractEmailAddresses(rawFrom)[0] || normalizeEmailAddress(fallbackEmail);
  const raw = (rawFrom ?? "").trim();
  if (!raw) return email;

  const match = raw.match(/^"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  const name = (match?.[1] ?? "").replace(/"/g, "").trim();
  if (name) return `${name} <${email}>`;
  return email;
}
