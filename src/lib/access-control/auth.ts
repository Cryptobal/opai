/**
 * Access Control — Auth Helper
 *
 * Validates either admin session (NextAuth) OR device token (Bearer).
 * Returns tenantId + installationId context for the request.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "./safe-query";

export interface AccessControlAuthResult {
  tenantId: string;
  installationId?: string | null;
  authType: "admin" | "device";
}

/**
 * Authenticates a request via admin session or device Bearer token.
 * For admin auth, verifies the installationId belongs to the tenant.
 * For device auth, returns the device's linked installationId.
 */
export async function requireAccessControlAuth(
  request: NextRequest,
  installationId?: string | null,
): Promise<AccessControlAuthResult | null> {
  // 1. Try admin session
  const adminCtx = await requireAuth();
  if (adminCtx) {
    if (installationId) {
      const installation = await prisma.crmInstallation.findFirst({
        where: { id: installationId, tenantId: adminCtx.tenantId },
        select: { id: true },
      });
      if (!installation) return null;
    }
    return {
      tenantId: adminCtx.tenantId,
      installationId,
      authType: "admin",
    };
  }

  // 2. Try device token
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) return null;

  const legacyDevice = await safeAccessControlQuery(
    () =>
      prisma.accessControlDevice.findUnique({
        where: { deviceToken: token },
        select: { id: true, isActive: true, installationId: true, installation: { select: { tenantId: true } } },
      }),
    null,
  );

  if (legacyDevice?.isActive) {
    if (installationId && legacyDevice.installationId !== installationId) return null;
    return {
      tenantId: legacyDevice.installation.tenantId,
      installationId: legacyDevice.installationId,
      authType: "device",
    };
  }

  const unified = await prisma.devicePairing.findFirst({
    where: { deviceToken: token },
    select: { installationId: true, installation: { select: { tenantId: true } } },
  }).catch(() => null);

  if (unified) {
    if (installationId && unified.installationId !== installationId) return null;
    return {
      tenantId: unified.installation.tenantId,
      installationId: unified.installationId,
      authType: "device",
    };
  }

  return null;
}
