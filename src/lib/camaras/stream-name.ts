import { createHash } from "crypto";

/**
 * Nombre de stream determinista y opaco: no revela el tenant.
 * Solo [a-z0-9]; go2rtc y Caddy lo aceptan en query `src`.
 */
export function streamNameFor(tenantId: string, camaraId: string): string {
  const digest = createHash("sha256")
    .update(`${tenantId}:${camaraId}`)
    .digest("hex")
    .slice(0, 20);
  return `c${digest}`;
}
