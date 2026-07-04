/**
 * Política de notificaciones de rondas por tenant (Fase 19).
 *
 * Setting JSON `rondas_notif_policy:{tenantId}` — todo opcional, con defaults:
 * - rondaStartedEnabled: si false, no se publica la tarjeta de inicio (la de
 *   término va suelta, sin hilo). Para tenants con cientos de rondas/día.
 * - rondasRouteToInstallationChannel: si true, las tarjetas ronda_* también van
 *   al canal Slack puenteado al chat de la instalación (además del ruteo por categoría).
 * - digestHour: hora local (America/Santiago) del digest diario de cumplimiento.
 * - digestRedBelow / digestGreenFrom: umbrales del semáforo del digest
 *   (🔴 < redBelow · 🟠 entre ambos · ✅ >= greenFrom), en porcentaje.
 */

import { prisma } from "@/lib/prisma";

export type RondasNotifPolicy = {
  rondaStartedEnabled: boolean;
  /** Si true, las tarjetas ronda_* también van al canal Slack puenteado del chat de la instalación. */
  rondasRouteToInstallationChannel: boolean;
  digestHour: number;
  digestRedBelow: number;
  digestGreenFrom: number;
};

export const DEFAULT_RONDAS_NOTIF_POLICY: RondasNotifPolicy = {
  rondaStartedEnabled: true,
  rondasRouteToInstallationChannel: true,
  digestHour: 8,
  digestRedBelow: 70,
  digestGreenFrom: 90,
};

const POLICY_SETTING_KEY = "rondas_notif_policy";

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function parseRondasNotifPolicy(raw: string | null | undefined): RondasNotifPolicy {
  if (!raw?.trim()) return { ...DEFAULT_RONDAS_NOTIF_POLICY };
  try {
    const parsed = JSON.parse(raw) as Partial<RondasNotifPolicy>;
    const redBelow = clampInt(parsed.digestRedBelow, 0, 100, DEFAULT_RONDAS_NOTIF_POLICY.digestRedBelow);
    return {
      rondaStartedEnabled:
        typeof parsed.rondaStartedEnabled === "boolean"
          ? parsed.rondaStartedEnabled
          : DEFAULT_RONDAS_NOTIF_POLICY.rondaStartedEnabled,
      rondasRouteToInstallationChannel:
        typeof parsed.rondasRouteToInstallationChannel === "boolean"
          ? parsed.rondasRouteToInstallationChannel
          : DEFAULT_RONDAS_NOTIF_POLICY.rondasRouteToInstallationChannel,
      digestHour: clampInt(parsed.digestHour, 0, 23, DEFAULT_RONDAS_NOTIF_POLICY.digestHour),
      digestRedBelow: redBelow,
      // El verde nunca puede quedar bajo el rojo (rango naranjo >= 0).
      digestGreenFrom: Math.max(
        redBelow,
        clampInt(parsed.digestGreenFrom, 0, 100, DEFAULT_RONDAS_NOTIF_POLICY.digestGreenFrom),
      ),
    };
  } catch {
    return { ...DEFAULT_RONDAS_NOTIF_POLICY };
  }
}

export async function getRondasNotifPolicy(tenantId: string): Promise<RondasNotifPolicy> {
  const setting = await prisma.setting.findFirst({
    where: { key: `${POLICY_SETTING_KEY}:${tenantId}`, tenantId },
    select: { value: true },
  });
  return parseRondasNotifPolicy(setting?.value ?? null);
}

export async function setRondasNotifPolicy(
  tenantId: string,
  partial: Partial<RondasNotifPolicy>,
): Promise<RondasNotifPolicy> {
  const current = await getRondasNotifPolicy(tenantId);
  const next = parseRondasNotifPolicy(JSON.stringify({ ...current, ...partial }));
  const key = `${POLICY_SETTING_KEY}:${tenantId}`;
  const existing = await prisma.setting.findFirst({ where: { key, tenantId }, select: { id: true } });
  const value = JSON.stringify(next);
  if (existing) {
    await prisma.setting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.setting.create({
      data: { key, value, type: "json", category: "rondas", tenantId },
    });
  }
  return next;
}
