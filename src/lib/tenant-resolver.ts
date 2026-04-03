/**
 * Tenant Resolver — Resuelve el tenantId para rutas públicas
 *
 * Las rutas protegidas usan session.user.tenantId (via requireAuth).
 * Las rutas públicas necesitan resolver el tenant por otros medios:
 * - Header X-Tenant-Slug
 * - Subdomain (securitas.opai.cl)
 * - Query param ?tenant=slug
 * - Context del recurso (installationId, deviceToken, etc.)
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Resuelve el tenantId desde la request HTTP.
 * Intenta en orden: header → subdomain → query param.
 * Retorna null si no puede resolver — el caller debe manejar el error.
 */
export async function resolveTenantFromRequest(
  request: NextRequest,
): Promise<string | null> {
  // 1. Header explícito (para APIs, mobile apps, etc.)
  const headerSlug = request.headers.get("x-tenant-slug");
  if (headerSlug) {
    return await tenantIdFromSlug(headerSlug);
  }

  // 2. Subdomain (securitas.opai.cl → slug = "securitas")
  const host = request.headers.get("host") ?? "";
  const parts = host.split(".");
  // Solo si tiene formato subdomain.domain.tld (3+ partes)
  if (parts.length >= 3) {
    const subdomain = parts[0];
    const skipSubdomains = ["www", "opai", "app", "api", "localhost"];
    if (!skipSubdomains.includes(subdomain)) {
      const id = await tenantIdFromSlug(subdomain);
      if (id) return id;
    }
  }

  // 3. Query param (?tenant=slug)
  const url = new URL(request.url);
  const tenantSlug = url.searchParams.get("tenant");
  if (tenantSlug) {
    return await tenantIdFromSlug(tenantSlug);
  }

  return null;
}

/**
 * Resuelve tenantId desde una instalación.
 * Útil para rutas públicas como marcación, ingreso TE, etc.
 */
export async function resolveTenantFromInstallation(
  installationId: string,
): Promise<string | null> {
  const installation = await prisma.crmInstallation.findUnique({
    where: { id: installationId },
    select: { tenantId: true },
  });
  return installation?.tenantId ?? null;
}

/**
 * Resuelve tenantId desde un guardia (por RUT).
 * Útil para portales de guardia y rondas.
 */
export async function resolveTenantFromGuardiaRut(
  rut: string,
): Promise<{ tenantId: string; guardiaId: string } | null> {
  const persona = await prisma.opsPersona.findFirst({
    where: { rut },
    select: {
      id: true,
      tenantId: true,
      guardia: { select: { id: true } },
    },
  });
  if (!persona || !persona.guardia) return null;
  return {
    tenantId: persona.tenantId,
    guardiaId: persona.guardia.id,
  };
}

// ── Internal helpers ──

const slugCache = new Map<string, { id: string; ts: number }>();
const SLUG_CACHE_TTL = 10 * 60 * 1000; // 10 min

async function tenantIdFromSlug(slug: string): Promise<string | null> {
  const cached = slugCache.get(slug);
  if (cached && Date.now() - cached.ts < SLUG_CACHE_TTL) {
    return cached.id;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug, active: true },
    select: { id: true },
  });

  if (tenant) {
    slugCache.set(slug, { id: tenant.id, ts: Date.now() });
    return tenant.id;
  }

  return null;
}
