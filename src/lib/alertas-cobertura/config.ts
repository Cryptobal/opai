import { prisma } from "@/lib/prisma";

export interface AlertaCoberturaConfig {
  // Oleadas — tiempos de espera en minutos
  oleada0EsperaMin: number;
  oleada1RadioKm: number;
  oleada1EsperaMin: number;
  oleada2RadioKm: number;
  oleada2EsperaMin: number;
  oleada3RadioKm: number;
  oleada3EsperaMin: number;
  oleadaExternaEsperaMin: number;

  // TTL general
  alertaTtlHoras: number;

  // Confirmación
  confirmacionDelayMin: number;

  // Notificaciones
  canalInternoDefault: string[];
  canalExternoDefault: string[];

  // Monto
  montoDefaultClp: number;

  // Feature flags
  habilitado: boolean;
  autoAsignarPauta: boolean;
  incluirTurnoSaliente: boolean;
  notificarChatInterno: boolean;
}

const DEFAULTS: AlertaCoberturaConfig = {
  oleada0EsperaMin: 5,
  oleada1RadioKm: 5,
  oleada1EsperaMin: 4,
  oleada2RadioKm: 15,
  oleada2EsperaMin: 4,
  oleada3RadioKm: 30,
  oleada3EsperaMin: 5,
  oleadaExternaEsperaMin: 15,
  alertaTtlHoras: 4,
  confirmacionDelayMin: 60,
  canalInternoDefault: ["PUSH", "EMAIL"],
  canalExternoDefault: ["WHATSAPP", "EMAIL"],
  montoDefaultClp: 0,
  habilitado: false,
  autoAsignarPauta: true,
  incluirTurnoSaliente: true,
  notificarChatInterno: true,
};

const CONFIG_PREFIX = "alertas_cobertura";

// Cache in-memory 5 min (mismo patrón que tenant-config.ts)
let cache: { config: AlertaCoberturaConfig; tenantId: string; expiresAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

export async function getAlertaCoberturaConfig(
  tenantId: string,
): Promise<AlertaCoberturaConfig> {
  if (cache && cache.tenantId === tenantId && cache.expiresAt > Date.now()) {
    return cache.config;
  }

  const settings = await prisma.setting.findMany({
    where: {
      key: { startsWith: `${CONFIG_PREFIX}.` },
      OR: [{ tenantId }, { tenantId: null }],
    },
  });

  const config = { ...DEFAULTS };

  // Tenant-specific settings override globals
  const byKey = new Map<string, string>();
  for (const s of settings) {
    // Tenant-specific wins over global
    if (s.tenantId === tenantId || !byKey.has(s.key)) {
      byKey.set(s.key, s.value);
    }
  }

  for (const [key, value] of byKey) {
    const field = key.replace(`${CONFIG_PREFIX}.`, "") as keyof AlertaCoberturaConfig;
    if (field in config) {
      try {
        (config as Record<string, unknown>)[field] = JSON.parse(value);
      } catch {
        (config as Record<string, unknown>)[field] = value;
      }
    }
  }

  cache = { config, tenantId, expiresAt: Date.now() + CACHE_TTL };
  return config;
}

export function invalidateAlertaCoberturaCache() {
  cache = null;
}

export async function updateAlertaCoberturaConfig(
  tenantId: string,
  updates: Partial<AlertaCoberturaConfig>,
): Promise<AlertaCoberturaConfig> {
  for (const [key, value] of Object.entries(updates)) {
    const settingKey = `${CONFIG_PREFIX}.${key}`;
    const existing = await prisma.setting.findFirst({
      where: { key: settingKey, tenantId },
    });

    if (existing) {
      await prisma.setting.update({
        where: { id: existing.id },
        data: { value: JSON.stringify(value) },
      });
    } else {
      await prisma.setting.create({
        data: {
          key: settingKey,
          value: JSON.stringify(value),
          type: "json",
          category: "alertas_cobertura",
          tenantId,
        },
      });
    }
  }

  invalidateAlertaCoberturaCache();
  return getAlertaCoberturaConfig(tenantId);
}
