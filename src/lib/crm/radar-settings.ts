import { prisma } from "@/lib/prisma";

/**
 * Kill-switch por tenant del Radar Comercial (setting `radar_comercial_enabled`).
 * Default: habilitado. Si está en "false", el hook de clasificación y los crons
 * del radar no corren para ese tenant.
 */
const KEY = "radar_comercial_enabled";

export async function isRadarComercialEnabled(tenantId: string): Promise<boolean> {
  const row = await prisma.setting.findFirst({
    where: { tenantId, key: KEY },
    select: { value: true },
  });
  if (!row) return true; // default: on
  return row.value !== "false";
}

export async function setRadarComercialEnabled(
  tenantId: string,
  enabled: boolean,
): Promise<void> {
  const value = enabled ? "true" : "false";
  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId, key: KEY } },
    update: { value },
    create: { tenantId, key: KEY, value, type: "boolean", category: "radar_comercial" },
  });
}
