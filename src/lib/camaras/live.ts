import type { AuthContext } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { buildRtspUrl } from "./brand-profiles";
import { decryptCameraSecret, sanitizeCameraError } from "./credentials";
import { fetchSnapshot, isRelayConfigured, publicRelayUrl, upsertStream } from "./relay-client";
import { signRelayToken } from "./relay-token";
import { getCamara } from "./mutate";
import { ptzMove, ptzStop } from "./onvif-ptz";
import { CAMARA_PUBLIC_SELECT, serializeCamara } from "./serialize";
import type { StreamQuality } from "./types";

export async function testCamaraConnection(tenantId: string, id: string) {
  const camara = await getCamara(tenantId, id, true);
  if (!camara) return { notFound: true as const };

  if (!isRelayConfigured()) {
    await prisma.opsCamara.update({
      where: { id },
      data: { status: "error", lastError: "Relay no configurado" },
    });
    return { error: "Relay no configurado", status: "error" as const };
  }

  const plain = decryptCameraSecret(camara.passwordEnc);
  const rtspUrl = buildRtspUrl(
    {
      brand: camara.brand,
      host: camara.host,
      rtspPort: camara.rtspPort,
      channel: camara.channel,
      streamQuality: camara.streamQuality as StreamQuality,
      customPath: camara.customPath,
      username: camara.username,
    },
    plain,
  );

  try {
    await upsertStream(camara.streamName, rtspUrl);
    const jpeg = await fetchSnapshot(camara.streamName);
    const updated = await prisma.opsCamara.update({
      where: { id },
      data: { status: "online", lastSeenAt: new Date(), lastError: null },
      select: CAMARA_PUBLIC_SELECT,
    });
    return {
      camera: serializeCamara(updated),
      dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
    };
  } catch (err) {
    const lastError = sanitizeCameraError(err instanceof Error ? err.message : "Fallo de conexión");
    const updated = await prisma.opsCamara.update({
      where: { id },
      data: { status: "offline", lastError },
      select: CAMARA_PUBLIC_SELECT,
    });
    return { camera: serializeCamara(updated), error: lastError, status: "offline" as const };
  }
}

export type CamaraPtzResult =
  | { ok: true }
  | { notFound: true }
  | { unavailable: true; error: string }
  | { error: string };

export async function runCamaraPtz(
  tenantId: string,
  id: string,
  input: { action: "move" | "stop"; pan?: number; tilt?: number; zoom?: number },
): Promise<CamaraPtzResult> {
  const camara = await getCamara(tenantId, id, true);
  if (!camara) return { notFound: true };
  if (!camara.ptzCapable) return { unavailable: true, error: "PTZ no disponible" };
  const password = decryptCameraSecret(camara.passwordEnc);
  const target = { host: camara.host, onvifPort: camara.onvifPort, username: camara.username };
  try {
    if (input.action === "stop") {
      await ptzStop(target, password);
    } else {
      await ptzMove(target, password, {
        pan: input.pan ?? 0,
        tilt: input.tilt ?? 0,
        zoom: input.zoom ?? 0,
      });
    }
    return { ok: true };
  } catch {
    return { error: "PTZ no disponible" };
  }
}

export async function issueRelayAccess(ctx: AuthContext, cameraIds: string[]) {
  const cameras = await prisma.opsCamara.findMany({
    where: { tenantId: ctx.tenantId, id: { in: cameraIds }, isActive: true },
    select: { id: true, streamName: true },
  });
  if (cameras.length !== cameraIds.length) {
    return { error: "Una o más cámaras no existen, están inactivas o no pertenecen al tenant", status: 404 as const };
  }
  const streams = cameras.map((c) => c.streamName);
  const token = await signRelayToken({
    tenantId: ctx.tenantId,
    streams,
    userId: ctx.userId,
  });
  const map: Record<string, string> = {};
  for (const c of cameras) map[c.id] = c.streamName;
  return {
    token,
    relayUrl: publicRelayUrl(),
    expiresIn: 600,
    streams: map,
  };
}
