import { prisma } from "@/lib/prisma";
import type { RadarVertical } from "@/modules/crm/email/radar-types";

/**
 * Kill-switch del Radar por vertical, a nivel tenant (tabla Setting).
 * Default: SOLO comercial ON (no cambia el comportamiento actual); el resto de
 * verticales OFF hasta que el tenant las active explícitamente.
 *
 * `cobranza` comparte flag con `finanzas`. Las verticales sin flag propio
 * (contratos, incidentes, otro) no generan items y devuelven false.
 */
const VERTICAL_KEY: Partial<Record<RadarVertical, string>> = {
  comercial: "radar_comercial_enabled",
  operaciones: "radar_operaciones_enabled",
  rrhh: "radar_rrhh_enabled",
  finanzas: "radar_finanzas_enabled",
  cobranza: "radar_finanzas_enabled",
};

/** Verticales configurables (con flag propio). `cobranza` cae en `finanzas`. */
export const CONFIGURABLE_VERTICALS = ["comercial", "operaciones", "rrhh", "finanzas"] as const;
export type ConfigurableVertical = (typeof CONFIGURABLE_VERTICALS)[number];

const DEFAULT_ENABLED: Partial<Record<RadarVertical, boolean>> = {
  comercial: true, // única ON por defecto
};

export async function isRadarVerticalEnabled(
  tenantId: string,
  vertical: RadarVertical,
): Promise<boolean> {
  const key = VERTICAL_KEY[vertical];
  if (!key) return false;
  const row = await prisma.setting.findFirst({
    where: { tenantId, key },
    select: { value: true },
  });
  if (!row) return DEFAULT_ENABLED[vertical] ?? false;
  return row.value !== "false";
}

export async function setRadarVerticalEnabled(
  tenantId: string,
  vertical: ConfigurableVertical,
  enabled: boolean,
): Promise<void> {
  const key = VERTICAL_KEY[vertical];
  if (!key) return;
  const value = enabled ? "true" : "false";
  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId, key } },
    update: { value },
    create: { tenantId, key, value, type: "boolean", category: "radar" },
  });
}

/** Estado de las 4 verticales configurables (para la página de Agentes, F3). */
export async function getRadarVerticalSettings(
  tenantId: string,
): Promise<Record<ConfigurableVertical, boolean>> {
  const entries = await Promise.all(
    CONFIGURABLE_VERTICALS.map(
      async (v) => [v, await isRadarVerticalEnabled(tenantId, v)] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<ConfigurableVertical, boolean>;
}

// ── Retrocompatibilidad: helpers específicos de comercial ──

export async function isRadarComercialEnabled(tenantId: string): Promise<boolean> {
  return isRadarVerticalEnabled(tenantId, "comercial");
}

export async function setRadarComercialEnabled(
  tenantId: string,
  enabled: boolean,
): Promise<void> {
  return setRadarVerticalEnabled(tenantId, "comercial", enabled);
}
