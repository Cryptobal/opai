/**
 * Configuración de auto-apertura de salas de negocio (Fase 16, B1).
 *
 * La activación por umbral es POR TENANT y viene APAGADA por defecto (Carlos
 * calibra a mano primero). Cuando `enabled`, una sala se abre sola cuando el
 * negocio supera el monto mínimo (CLP) Y/O alcanza el orden de etapa mínimo.
 * Se guarda en la tabla genérica `Setting` (category "slack_deal_rooms"), mismo
 * patrón que `knowledge/config.ts`.
 */

import { prisma } from "@/lib/prisma";

export interface DealRoomConfig {
  /** Si false (default), NUNCA se abre una sala automáticamente. */
  enabled: boolean;
  /** Monto mínimo del negocio (CLP) para gatillar la sala. 0 = sin umbral de monto. */
  minAmountClp: number;
  /** Orden de etapa mínimo (CrmPipelineStage.order) para gatillar. 0 = sin umbral de etapa. */
  minStageOrder: number;
}

const DEFAULTS: DealRoomConfig = { enabled: false, minAmountClp: 0, minStageOrder: 0 };

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: DealRoomConfig; expires: number }>();

const KEY = {
  enabled: "slack_deal_rooms.enabled",
  minAmountClp: "slack_deal_rooms.min_amount_clp",
  minStageOrder: "slack_deal_rooms.min_stage_order",
} as const;

const CATEGORY = "slack_deal_rooms";

export function invalidateDealRoomConfig(tenantId: string): void {
  cache.delete(tenantId);
}

export async function getDealRoomConfig(tenantId: string): Promise<DealRoomConfig> {
  const cached = cache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.value;

  const rows = await prisma.setting.findMany({
    where: { tenantId, category: CATEGORY, key: { in: Object.values(KEY) } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const cfg: DealRoomConfig = {
    enabled: parseBoolOr(map.get(KEY.enabled), DEFAULTS.enabled),
    minAmountClp: parseIntOr(map.get(KEY.minAmountClp), DEFAULTS.minAmountClp, 0, 100_000_000_000),
    minStageOrder: parseIntOr(map.get(KEY.minStageOrder), DEFAULTS.minStageOrder, 0, 1000),
  };
  cache.set(tenantId, { value: cfg, expires: Date.now() + CACHE_TTL_MS });
  return cfg;
}

export async function setDealRoomConfig(tenantId: string, partial: Partial<DealRoomConfig>): Promise<DealRoomConfig> {
  const updates: Array<{ key: string; value: string; type: string }> = [];
  if (partial.enabled !== undefined) updates.push({ key: KEY.enabled, value: String(partial.enabled), type: "boolean" });
  if (partial.minAmountClp !== undefined) updates.push({ key: KEY.minAmountClp, value: String(partial.minAmountClp), type: "number" });
  if (partial.minStageOrder !== undefined) updates.push({ key: KEY.minStageOrder, value: String(partial.minStageOrder), type: "number" });

  if (updates.length > 0) {
    await prisma.$transaction(
      updates.map((u) =>
        prisma.setting.upsert({
          where: { tenantId_key: { tenantId, key: u.key } },
          update: { value: u.value, type: u.type, category: CATEGORY },
          create: { tenantId, key: u.key, value: u.value, type: u.type, category: CATEGORY },
        }),
      ),
    );
  }
  invalidateDealRoomConfig(tenantId);
  return getDealRoomConfig(tenantId);
}

function parseIntOr(s: string | undefined, fallback: number, min: number, max: number): number {
  if (!s) return fallback;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < min || n > max) return fallback;
  return n;
}

function parseBoolOr(s: string | undefined, fallback: boolean): boolean {
  if (s === undefined) return fallback;
  return s === "true" || s === "1";
}
