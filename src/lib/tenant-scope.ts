/**
 * Verificación de pertenencia de recursos al tenant de la sesión.
 *
 * Complementa el RBAC (canView/canEdit/…): el rol autoriza la acción;
 * estos helpers garantizan que el recurso pertenece al tenant del JWT.
 *
 * Respuesta ante acceso cruzado o id inexistente: siempre 404 (nunca 403),
 * para no confirmar la existencia del recurso ni habilitar enumeración.
 *
 * Nunca aceptar tenantId desde path, query, body ni header — solo del AuthContext.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/api-auth";
import { isUuid } from "@/lib/utils/uuid";

export type InstallationAccessResult =
  | { ok: true; installationId: string }
  | { ok: false; response: NextResponse };

export type GuardiaAccessResult =
  | { ok: true; guardiaId: string }
  | { ok: false; response: NextResponse };

function notFound(message: string): { ok: false; response: NextResponse } {
  return {
    ok: false,
    response: NextResponse.json(
      { success: false, error: message },
      { status: 404 },
    ),
  };
}

/**
 * Verifica que la instalación exista y pertenezca al tenant de la sesión.
 * Id malformado → 404 sin consultar la BD.
 */
export async function requireInstallationAccess(
  ctx: AuthContext,
  installationId: string,
): Promise<InstallationAccessResult> {
  if (!isUuid(installationId)) {
    return notFound("Instalación no encontrada");
  }

  const installation = await prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId: ctx.tenantId },
    select: { id: true },
  });

  if (!installation) {
    return notFound("Instalación no encontrada");
  }

  return { ok: true, installationId: installation.id };
}

/**
 * Verifica que el guardia exista y pertenezca al tenant de la sesión.
 * Id malformado → 404 sin consultar la BD.
 */
export async function requireGuardiaAccess(
  ctx: AuthContext,
  guardiaId: string,
): Promise<GuardiaAccessResult> {
  if (!isUuid(guardiaId)) {
    return notFound("Guardia no encontrado");
  }

  const guardia = await prisma.opsGuardia.findFirst({
    where: { id: guardiaId, tenantId: ctx.tenantId },
    select: { id: true },
  });

  if (!guardia) {
    return notFound("Guardia no encontrado");
  }

  return { ok: true, guardiaId: guardia.id };
}

/**
 * ¿Puede este tenant escribir en catálogos globales compartidos
 * (PayrollParameterVersion, CrmIndustry rename)?
 *
 * Lee PAYROLL_PARAMS_WRITE_TENANT_SLUGS (lista separada por comas).
 * Si la variable está vacía o ausente → false (falla cerrada).
 *
 * PayrollParameterVersion y CrmIndustry no tienen tenantId: son tablas
 * compartidas por toda la plataforma. La solución definitiva (Platform Admin
 * o tenantId propio) está pendiente.
 */
export function isGlobalCatalogWriter(tenantSlug: string): boolean {
  const raw = process.env.PAYROLL_PARAMS_WRITE_TENANT_SLUGS ?? "";
  if (!raw.trim() || !tenantSlug.trim()) return false;
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(tenantSlug.trim().toLowerCase());
}
