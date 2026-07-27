import { cache } from "react";
import { auth } from "@/lib/auth";
import { resolvePermissions } from "@/lib/permissions-server";
import {
  getTenantFeatureFlagsList,
  getTenantModulesList,
} from "@/lib/tenant-modules";
import { getTenantCompanyConfig } from "@/lib/tenant-config";

/**
 * Contexto RSC compartido del shell `(app)`.
 * Sin argumentos → React.cache deduplica layout + page en la misma request
 * (p.ej. hop frío de `/productividad`).
 */
export const getAppRequestContext = cache(async () => {
  const session = await auth();
  if (!session?.user) return null;

  const [permissions, tenantModules, tenantFlags, companyConfig] = await Promise.all([
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
  ]);

  return {
    session,
    permissions,
    tenantModules,
    tenantFlags,
    companyConfig,
  };
});
