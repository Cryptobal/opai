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

/** Estrategia de nombre de canal al cambiar de etapa (Fase 3). */
export type ChannelNaming = "stageSuffix" | "emoji" | "stagePrefix" | "stable";

export interface DealRoomConfig {
  /** Si false (default), NUNCA se abre una sala automáticamente. */
  enabled: boolean;
  /** Monto mínimo del negocio (CLP) para gatillar la sala. 0 = sin umbral de monto. */
  minAmountClp: number;
  /** Orden de etapa mínimo (CrmPipelineStage.order) para gatillar. 0 = sin umbral de etapa. */
  minStageOrder: number;
  /**
   * Cómo refleja el nombre del canal la etapa (Fase 3):
   * · "stageSuffix" (default): el nombre termina con la etapa exacta
   *   (`neg-{cliente}-{negocio}-{etapa}`) y se renombra en cada cambio de etapa.
   * · "emoji": renombra SOLO al cruzar macro-fase (🌱→🔥→🤝), sin ruido, en el prefijo.
   * · "stagePrefix": prefija el slug con la etapa ({etapa}-{cliente}-{negocio}).
   * · "stable": nunca toca el nombre (la etapa vive en ficha + topic).
   */
  channelNaming: ChannelNaming;
  /** Si true, mantiene el board del canal hub #pipeline. Default false. */
  pipelineHubEnabled: boolean;
  /** Ganar → el canal pasa a operativo (handoff automático). Default true. */
  autoHandoffOnWon: boolean;
  /** Perder → el canal se archiva automáticamente. Default true. */
  autoArchiveOnLost: boolean;
  /**
   * Ganar → crea/actualiza el canvas "Ficha de Inicio" del canal. Default false
   * (no sorprender a Gard hasta reconectar los scopes canvases:*).
   */
  startCanvasOnWon: boolean;
}

const DEFAULTS: DealRoomConfig = {
  enabled: false,
  minAmountClp: 0,
  minStageOrder: 0,
  channelNaming: "stageSuffix",
  pipelineHubEnabled: false,
  autoHandoffOnWon: true,
  autoArchiveOnLost: true,
  startCanvasOnWon: false,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: DealRoomConfig; expires: number }>();

const KEY = {
  enabled: "slack_deal_rooms.enabled",
  minAmountClp: "slack_deal_rooms.min_amount_clp",
  minStageOrder: "slack_deal_rooms.min_stage_order",
  channelNaming: "slack_deal_rooms.channel_naming",
  pipelineHubEnabled: "slack_deal_rooms.pipeline_hub_enabled",
  autoHandoffOnWon: "slack_deal_rooms.auto_handoff_on_won",
  autoArchiveOnLost: "slack_deal_rooms.auto_archive_on_lost",
  startCanvasOnWon: "slack_deal_rooms.start_canvas_on_won",
} as const;

// Estado runtime del hub #pipeline (no cacheado: se lee/escribe puntualmente).
const HUB_KEY = {
  channelId: "slack_deal_rooms.pipeline_hub_channel_id",
  ts: "slack_deal_rooms.pipeline_hub_ts",
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
    channelNaming: parseNamingOr(map.get(KEY.channelNaming), DEFAULTS.channelNaming),
    pipelineHubEnabled: parseBoolOr(map.get(KEY.pipelineHubEnabled), DEFAULTS.pipelineHubEnabled),
    autoHandoffOnWon: parseBoolOr(map.get(KEY.autoHandoffOnWon), DEFAULTS.autoHandoffOnWon),
    autoArchiveOnLost: parseBoolOr(map.get(KEY.autoArchiveOnLost), DEFAULTS.autoArchiveOnLost),
    startCanvasOnWon: parseBoolOr(map.get(KEY.startCanvasOnWon), DEFAULTS.startCanvasOnWon),
  };
  cache.set(tenantId, { value: cfg, expires: Date.now() + CACHE_TTL_MS });
  return cfg;
}

/** Estado del board del hub #pipeline (channelId + ts del mensaje fijado). */
export async function getPipelineHubState(tenantId: string): Promise<{ channelId: string | null; ts: string | null }> {
  const rows = await prisma.setting.findMany({
    where: { tenantId, category: CATEGORY, key: { in: [HUB_KEY.channelId, HUB_KEY.ts] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return { channelId: map.get(HUB_KEY.channelId) ?? null, ts: map.get(HUB_KEY.ts) ?? null };
}

export async function setPipelineHubState(tenantId: string, channelId: string, ts: string): Promise<void> {
  await prisma.$transaction([
    prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: HUB_KEY.channelId } },
      update: { value: channelId, type: "string", category: CATEGORY },
      create: { tenantId, key: HUB_KEY.channelId, value: channelId, type: "string", category: CATEGORY },
    }),
    prisma.setting.upsert({
      where: { tenantId_key: { tenantId, key: HUB_KEY.ts } },
      update: { value: ts, type: "string", category: CATEGORY },
      create: { tenantId, key: HUB_KEY.ts, value: ts, type: "string", category: CATEGORY },
    }),
  ]);
}

export async function setDealRoomConfig(tenantId: string, partial: Partial<DealRoomConfig>): Promise<DealRoomConfig> {
  const updates: Array<{ key: string; value: string; type: string }> = [];
  if (partial.enabled !== undefined) updates.push({ key: KEY.enabled, value: String(partial.enabled), type: "boolean" });
  if (partial.minAmountClp !== undefined) updates.push({ key: KEY.minAmountClp, value: String(partial.minAmountClp), type: "number" });
  if (partial.minStageOrder !== undefined) updates.push({ key: KEY.minStageOrder, value: String(partial.minStageOrder), type: "number" });
  if (partial.channelNaming !== undefined) updates.push({ key: KEY.channelNaming, value: partial.channelNaming, type: "string" });
  if (partial.pipelineHubEnabled !== undefined) updates.push({ key: KEY.pipelineHubEnabled, value: String(partial.pipelineHubEnabled), type: "boolean" });
  if (partial.autoHandoffOnWon !== undefined) updates.push({ key: KEY.autoHandoffOnWon, value: String(partial.autoHandoffOnWon), type: "boolean" });
  if (partial.autoArchiveOnLost !== undefined) updates.push({ key: KEY.autoArchiveOnLost, value: String(partial.autoArchiveOnLost), type: "boolean" });
  if (partial.startCanvasOnWon !== undefined) updates.push({ key: KEY.startCanvasOnWon, value: String(partial.startCanvasOnWon), type: "boolean" });

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

function parseNamingOr(s: string | undefined, fallback: ChannelNaming): ChannelNaming {
  return s === "stageSuffix" || s === "emoji" || s === "stagePrefix" || s === "stable" ? s : fallback;
}
