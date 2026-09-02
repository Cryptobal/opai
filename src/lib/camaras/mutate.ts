import { randomUUID } from "crypto";
import type { AuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createOpsAuditLog } from "@/lib/ops";
import { BRAND_PROFILES, buildRtspUrl, isCameraBrand } from "./brand-profiles";
import { decryptCameraSecret, encryptCameraSecret } from "./credentials";
import { streamNameFor } from "./stream-name";
import { CAMARA_PUBLIC_SELECT, isAdminUsername, serializeCamara } from "./serialize";
import { getCamara, syncRelay } from "./repo";
import type { createCamaraSchema, updateCamaraSchema } from "./schemas";
import type { z } from "zod";
import type { StreamQuality } from "./types";

type CreateInput = z.infer<typeof createCamaraSchema>;
type UpdateInput = z.infer<typeof updateCamaraSchema>;

export { assertInstallation, deactivateCamara, getCamara } from "./repo";

export async function createCamara(ctx: AuthContext, input: CreateInput) {
  const id = randomUUID();
  const streamName = streamNameFor(ctx.tenantId, id);
  const brand = isCameraBrand(input.brand) ? input.brand : "generic";
  const rtspPort = input.rtspPort ?? BRAND_PROFILES[brand].rtspPort;
  const onvifPort = input.onvifPort === undefined ? BRAND_PROFILES[brand].onvifPort : input.onvifPort;
  const quality = input.streamQuality as StreamQuality;
  const rtspUrl = buildRtspUrl({ ...input, brand, rtspPort, streamQuality: quality }, input.password);
  const warning = await syncRelay(streamName, rtspUrl);

  const row = await prisma.opsCamara.create({
    data: {
      id,
      tenantId: ctx.tenantId,
      installationId: input.installationId,
      name: input.name,
      sourceType: input.sourceType,
      brand,
      host: input.host,
      rtspPort,
      onvifPort,
      channel: input.channel,
      streamQuality: quality,
      customPath: brand === "generic" ? (input.customPath ?? null) : null,
      username: input.username,
      passwordEnc: encryptCameraSecret(input.password),
      ptzCapable: input.ptzCapable,
      streamName,
      status: warning ? "error" : "untested",
      lastError: warning,
      notes: input.notes ?? null,
      sortOrder: input.sortOrder ?? 0,
      createdBy: ctx.userId,
    },
    select: CAMARA_PUBLIC_SELECT,
  });

  await createOpsAuditLog(ctx, "camara.create", "OpsCamara", id, {
    name: input.name,
    installationId: input.installationId,
    brand,
  });

  return {
    camera: serializeCamara(row),
    warning,
    adminUsernameWarning: isAdminUsername(input.username)
      ? "Usa un usuario de solo visualización; evita 'admin'."
      : null,
  };
}

export async function updateCamara(ctx: AuthContext, id: string, input: UpdateInput) {
  const existing = await getCamara(ctx.tenantId, id);
  if (!existing) return null;

  const brand = input.brand && isCameraBrand(input.brand) ? input.brand : existing.brand;
  const rtspPort = input.rtspPort ?? existing.rtspPort;
  const quality = (input.streamQuality ?? existing.streamQuality) as StreamQuality;
  const username = input.username ?? existing.username;
  const host = input.host ?? existing.host;
  const channel = input.channel ?? existing.channel;
  const customPath = input.customPath === undefined ? existing.customPath : input.customPath;
  const passwordChanged = Boolean(input.password);
  const connChanged = passwordChanged
    || input.host !== undefined
    || input.rtspPort !== undefined
    || input.channel !== undefined
    || input.brand !== undefined
    || input.streamQuality !== undefined
    || input.customPath !== undefined
    || input.username !== undefined;

  let warning: string | null = null;
  let status = existing.status;
  let lastError = existing.lastError;
  if (connChanged) {
    const plain = input.password ?? decryptCameraSecret(existing.passwordEnc);
    warning = await syncRelay(
      existing.streamName,
      buildRtspUrl({ brand, host, rtspPort, channel, streamQuality: quality, customPath, username }, plain),
    );
    if (warning) {
      status = "error";
      lastError = warning;
    }
  }

  const row = await prisma.opsCamara.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.sourceType !== undefined ? { sourceType: input.sourceType } : {}),
      ...(input.brand !== undefined ? { brand } : {}),
      ...(input.host !== undefined ? { host } : {}),
      ...(input.rtspPort !== undefined ? { rtspPort } : {}),
      ...(input.onvifPort !== undefined ? { onvifPort: input.onvifPort } : {}),
      ...(input.channel !== undefined ? { channel } : {}),
      ...(input.streamQuality !== undefined ? { streamQuality: quality } : {}),
      ...(input.customPath !== undefined ? { customPath } : {}),
      ...(input.username !== undefined ? { username } : {}),
      ...(input.password ? { passwordEnc: encryptCameraSecret(input.password) } : {}),
      ...(input.ptzCapable !== undefined ? { ptzCapable: input.ptzCapable } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      status,
      lastError,
    },
    select: CAMARA_PUBLIC_SELECT,
  });

  await createOpsAuditLog(ctx, "camara.update", "OpsCamara", id, {
    passwordChanged,
    fields: Object.keys(input),
  });

  return {
    camera: serializeCamara(row),
    warning,
    adminUsernameWarning: isAdminUsername(username)
      ? "Usa un usuario de solo visualización; evita 'admin'."
      : null,
  };
}
