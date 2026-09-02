import type { AuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createOpsAuditLog } from "@/lib/ops";
import { sanitizeCameraError } from "./credentials";
import { isRelayConfigured, removeStream, upsertStream } from "./relay-client";
import { CAMARA_PUBLIC_SELECT, serializeCamara } from "./serialize";

export async function assertInstallation(tenantId: string, installationId: string) {
  return prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    select: { id: true },
  });
}

export async function getCamara(tenantId: string, id: string, activeOnly = false) {
  return prisma.opsCamara.findFirst({
    where: { id, tenantId, ...(activeOnly ? { isActive: true } : {}) },
    select: { ...CAMARA_PUBLIC_SELECT, passwordEnc: true },
  });
}

export async function syncRelay(streamName: string, rtspUrl: string): Promise<string | null> {
  if (!isRelayConfigured()) return "Relay no configurado";
  try {
    await upsertStream(streamName, rtspUrl);
    return null;
  } catch (err) {
    return sanitizeCameraError(err instanceof Error ? err.message : "Relay no disponible");
  }
}

export async function deactivateCamara(ctx: AuthContext, id: string) {
  const existing = await getCamara(ctx.tenantId, id);
  if (!existing) return null;
  try {
    await removeStream(existing.streamName);
  } catch {
    // baja lógica igual si el relay no responde
  }
  const row = await prisma.opsCamara.update({
    where: { id },
    data: { isActive: false, status: "offline" },
    select: CAMARA_PUBLIC_SELECT,
  });
  await createOpsAuditLog(ctx, "camara.deactivate", "OpsCamara", id, { name: existing.name });
  return serializeCamara(row);
}
