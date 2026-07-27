/**
 * Preferencia de arranque post-login (persiste en AdminPreference).
 * Separado de la cookie de superficie (estado de sesión).
 */

import { prisma } from "@/lib/prisma";
import { resolvePermissions } from "@/lib/permissions-server";
import { getTenantModulesList } from "@/lib/tenant-modules";
import {
  parseSurface,
  resolveProductividadLanding,
  type Surface,
} from "@/lib/surface";

export type LandingSurface = Surface;

/** Lee landingSurface del usuario; descarta valores desconocidos. */
export async function getLandingSurface(
  adminId: string,
): Promise<LandingSurface | null> {
  const pref = await prisma.adminPreference.findUnique({
    where: { adminId },
    select: { landingSurface: true },
  });
  if (!pref?.landingSurface) return null;
  const parsed = parseSurface(pref.landingSurface);
  // parseSurface cae a erp ante desconocidos; solo aceptar literales exactos.
  if (pref.landingSurface !== "erp" && pref.landingSurface !== "productividad") {
    return null;
  }
  return parsed;
}

/**
 * Destino post-login según preferencia + permisos actuales.
 * Degrada a /hub si productividad ya no es accesible.
 */
export async function resolvePostLoginPath(opts: {
  adminId: string;
  role: string;
  roleTemplateId?: string | null;
  tenantId?: string | null;
  /** Si el callbackUrl no es el default, se respeta. */
  callbackUrl?: string;
}): Promise<string> {
  const callback = opts.callbackUrl?.trim() || "/hub";
  // Respetar deep-links explícitos (no el default /hub).
  if (callback !== "/hub" && callback !== "/") {
    return callback;
  }

  const landing = await getLandingSurface(opts.adminId);
  if (landing !== "productividad") {
    return "/hub";
  }

  const [permissions, tenantModules] = await Promise.all([
    resolvePermissions({
      role: opts.role,
      roleTemplateId: opts.roleTemplateId,
    }),
    opts.tenantId
      ? getTenantModulesList(opts.tenantId)
      : Promise.resolve([] as string[]),
  ]);

  const enabled = new Set(tenantModules);
  const isAdmin = opts.role === "owner" || opts.role === "admin";
  const path = resolveProductividadLanding(
    permissions,
    (key) => enabled.has(key),
    { isAdmin },
  );

  return path ?? "/hub";
}
