import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions-server";
import {
  getTenantFeatureFlagsList,
  getTenantModulesList,
} from "@/lib/tenant-modules";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { prisma } from "@/lib/prisma";

const ADMIN_PHOTO_REVALIDATE = 60;

export function adminPhotoTag(adminId: string): string {
  return `admin-photo:${adminId}`;
}

/** Invalidar cache de foto de perfil (POST/DELETE /api/me/avatar). */
export function invalidateAdminPhotoCache(adminId: string): void {
  revalidateTag(adminPhotoTag(adminId), "max");
}

function getCachedAdminPhotoUrl(adminId: string): Promise<string | null> {
  return unstable_cache(
    async () => {
      const admin = await prisma.admin.findUnique({
        where: { id: adminId },
        select: { photoUrl: true },
      });
      return admin?.photoUrl ?? null;
    },
    ["admin-photo", adminId],
    { revalidate: ADMIN_PHOTO_REVALIDATE, tags: [adminPhotoTag(adminId)] },
  )();
}

/**
 * Contexto RSC compartido del shell `(app)`.
 * Sin argumentos → React.cache deduplica layout + page en la misma request
 * (p.ej. hop frío de `/productividad`).
 */
export const getAppRequestContext = cache(async () => {
  const session = await auth();
  if (!session?.user) return null;

  const [permissions, tenantModules, tenantFlags, companyConfig, photoUrl] =
    await Promise.all([
      resolvePermissions({
        role: session.user.role,
        roleTemplateId: session.user.roleTemplateId,
      }),
      session.user.tenantId
        ? getTenantModulesList(session.user.tenantId)
        : Promise.resolve([] as string[]),
      session.user.tenantId
        ? getTenantFeatureFlagsList(session.user.tenantId)
        : Promise.resolve([] as string[]),
      session.user.tenantId
        ? getTenantCompanyConfig(session.user.tenantId)
        : Promise.resolve(null),
      // Foto de perfil para sidebar / bottom nav (no va en el JWT).
      getCachedAdminPhotoUrl(session.user.id),
    ]);

  return {
    session,
    permissions,
    tenantModules,
    tenantFlags,
    companyConfig,
    photoUrl,
  };
});
