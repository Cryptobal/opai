/** Parsea cabecera HTTP Date (RFC 1123). */
export function parseHttpDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const ms = Date.parse(value.trim());
  if (!Number.isFinite(ms)) return null;
  return new Date(ms);
}

/** Parsea `ts=` epoch (segundos, posiblemente fraccionarios) de Cloudflare `/cdn-cgi/trace`. */
export function parseCloudflareTraceTs(body: string): Date | null {
  const match = body.match(/(?:^|\n)ts=([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000);
}
