/**
 * Allowlist del modo read_only (Edge-safe, sin Prisma).
 * POST/PATCH/PUT/DELETE a /api/* se rechazan salvo estos prefijos.
 */

export const TENANT_READ_ONLY_ALLOWLIST = [
  "/api/auth",
  "/api/tenant/plan",
  "/api/health",
  "/api/platform",
] as const;

export function isTenantReadOnlyWriteAllowed(pathname: string): boolean {
  return TENANT_READ_ONLY_ALLOWLIST.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
