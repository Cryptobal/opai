/**
 * Platform-level AI service.
 *
 * Reads the centralized AI provider config (managed by Platform Admin)
 * and exposes helpers for all AI consumers in the app.
 */

import { prisma } from "@/lib/prisma";
import { decryptApiKey } from "@/lib/ai-encryption";
import { KNOWN_PROVIDERS } from "@/lib/ai-known-models";
import { computeCostUSD } from "@/lib/ai-pricing";

export type PlatformAIConfig = {
  providerType: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  displayName: string;
};

/**
 * Returns the active platform-level AI provider config, or null if none configured.
 * Falls back to process.env.OPENAI_API_KEY when no platform provider exists.
 */
export async function getPlatformAIConfig(): Promise<PlatformAIConfig | null> {
  try {
    const provider = await prisma.platformAiProvider.findFirst({
      where: { isActive: true, apiKey: { not: null } },
      include: {
        models: {
          where: { isDefault: true, isActive: true },
          take: 1,
        },
      },
    });

    if (provider?.apiKey) {
      let model: { modelId: string; displayName: string } | null =
        provider.models[0] ?? null;

      if (!model) {
        model = await prisma.platformAiModel.findFirst({
          where: { providerId: provider.id, isActive: true },
          orderBy: { costTier: "asc" },
        });
      }

      if (!model) {
        model = await prisma.platformAiModel.findFirst({
          where: { providerId: provider.id },
          orderBy: { costTier: "asc" },
        });
      }

      if (model) {
        const fallbackUrl =
          KNOWN_PROVIDERS.find(
            (kp) => kp.providerType === provider.providerType,
          )?.defaultBaseUrl ?? "";

        return {
          providerType: provider.providerType,
          modelId: model.modelId,
          apiKey: decryptApiKey(provider.apiKey),
          baseUrl: provider.baseUrl || fallbackUrl,
          displayName: model.displayName,
        };
      }
    }
  } catch (error) {
    console.warn("[platform-ai-service] Error reading platform AI config:", error);
  }

  const envKey = process.env.OPENAI_API_KEY;
  if (envKey && envKey !== "sk-build-placeholder") {
    return {
      providerType: "openai",
      modelId: "gpt-4o-mini",
      apiKey: envKey,
      baseUrl: "https://api.openai.com",
      displayName: "GPT-4o Mini (env)",
    };
  }

  return null;
}

/**
 * Resuelve la config de IA para un tenant específico.
 * Política:
 *   1. Si el tenant tiene un TenantAiProvider activo con apiKey y modelo → usar ese.
 *   2. Si no → caer al provider de plataforma (getPlatformAIConfig).
 *   3. Si tampoco → null.
 */
export async function getAIConfigForTenant(
  tenantId: string,
): Promise<PlatformAIConfig | null> {
  if (!tenantId) return getPlatformAIConfig();

  try {
    const provider = await prisma.tenantAiProvider.findFirst({
      where: { tenantId, isActive: true, apiKey: { not: null } },
      include: {
        models: { where: { isDefault: true, isActive: true }, take: 1 },
      },
    });

    if (provider?.apiKey) {
      let model: { modelId: string; displayName: string } | null =
        provider.models[0] ?? null;

      if (!model) {
        model = await prisma.tenantAiModel.findFirst({
          where: { providerId: provider.id, isActive: true },
          orderBy: { costTier: "asc" },
        });
      }

      if (model) {
        const fallbackUrl =
          KNOWN_PROVIDERS.find(
            (kp) => kp.providerType === provider.providerType,
          )?.defaultBaseUrl ?? "";

        return {
          providerType: provider.providerType,
          modelId: model.modelId,
          apiKey: decryptApiKey(provider.apiKey),
          baseUrl: provider.baseUrl || fallbackUrl,
          displayName: model.displayName,
        };
      }
    }
  } catch (error) {
    console.warn(
      "[platform-ai-service] Error reading tenant AI config:",
      error,
    );
  }

  return getPlatformAIConfig();
}

/* ── Usage logging ── */

type UsageLogParams = {
  tenantId?: string | null;
  userId?: string | null;
  providerType: string;
  model: string;
  feature: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Fire-and-forget usage log. Never throws — errors are silently logged.
 */
export function logAiUsage(params: UsageLogParams): void {
  prisma.aiUsageLog
    .create({
      data: {
        tenantId: params.tenantId ?? null,
        userId: params.userId ?? null,
        providerType: params.providerType,
        model: params.model,
        feature: params.feature,
        inputTokens: params.inputTokens ?? 0,
        outputTokens: params.outputTokens ?? 0,
        totalTokens: params.totalTokens ?? (params.inputTokens ?? 0) + (params.outputTokens ?? 0),
        estimatedCost: params.estimatedCost ?? 0,
        durationMs: params.durationMs ?? null,
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      },
    })
    .catch((err) => {
      console.warn("[platform-ai-service] Failed to log AI usage:", err);
    });
}

/* ── Usage stats ── */

type UsageFilter = {
  tenantId?: string;
  feature?: string;
  from?: Date;
  to?: Date;
};

type UsageStat = {
  tenantId: string | null;
  feature: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
};

export async function getUsageStats(filters: UsageFilter = {}): Promise<UsageStat[]> {
  const where: Record<string, unknown> = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.feature) where.feature = filters.feature;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const grouped = await prisma.aiUsageLog.groupBy({
    by: ["tenantId", "feature"],
    where,
    _count: { id: true },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      estimatedCost: true,
    },
    orderBy: { _sum: { totalTokens: "desc" } },
  });

  return grouped.map((g) => ({
    tenantId: g.tenantId,
    feature: g.feature,
    totalRequests: g._count.id,
    totalInputTokens: g._sum.inputTokens ?? 0,
    totalOutputTokens: g._sum.outputTokens ?? 0,
    totalTokens: g._sum.totalTokens ?? 0,
    totalCost: g._sum.estimatedCost ?? 0,
  }));
}

/* ── Usage summary (con costo estimado por tarifario) ── */

export type UsageRow = {
  key: string;
  label: string;
  sublabel?: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUSD: number;
  /** false cuando el modelo no está tarifado (costo no estimable). */
  priced: boolean;
};

export type UsageSummary = {
  totals: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUSD: number;
    /** Requests cuyo modelo no tiene tarifa conocida (costo subestimado). */
    unpricedRequests: number;
  };
  byFeature: UsageRow[];
  byModel: UsageRow[];
  byTenant: UsageRow[];
};

/**
 * Resumen de consumo de IA con costo estimado a partir del tarifario
 * (`ai-pricing.ts`). Agrupa por (tenant, feature, modelo, proveedor) en una
 * sola consulta y consolida en cortes por feature, modelo y tenant.
 */
export async function getUsageSummary(filters: UsageFilter = {}): Promise<UsageSummary> {
  const where: Record<string, unknown> = {};
  if (filters.tenantId) where.tenantId = filters.tenantId;
  if (filters.feature) where.feature = filters.feature;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const grouped = await prisma.aiUsageLog.groupBy({
    by: ["tenantId", "feature", "model", "providerType"],
    where,
    _count: { id: true },
    _sum: { inputTokens: true, outputTokens: true, totalTokens: true },
  });

  const totals = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUSD: 0,
    unpricedRequests: 0,
  };

  const featureMap = new Map<string, UsageRow>();
  const modelMap = new Map<string, UsageRow>();
  const tenantMap = new Map<string, UsageRow>();

  const bump = (
    map: Map<string, UsageRow>,
    key: string,
    label: string,
    sublabel: string | undefined,
    g: (typeof grouped)[number],
    cost: { usd: number; priced: boolean },
  ) => {
    const input = g._sum.inputTokens ?? 0;
    const output = g._sum.outputTokens ?? 0;
    const total = g._sum.totalTokens ?? input + output;
    const existing = map.get(key);
    if (existing) {
      existing.requests += g._count.id;
      existing.inputTokens += input;
      existing.outputTokens += output;
      existing.totalTokens += total;
      existing.costUSD += cost.usd;
      existing.priced = existing.priced && cost.priced;
    } else {
      map.set(key, {
        key,
        label,
        sublabel,
        requests: g._count.id,
        inputTokens: input,
        outputTokens: output,
        totalTokens: total,
        costUSD: cost.usd,
        priced: cost.priced,
      });
    }
  };

  for (const g of grouped) {
    const input = g._sum.inputTokens ?? 0;
    const output = g._sum.outputTokens ?? 0;
    const total = g._sum.totalTokens ?? input + output;
    const cost = computeCostUSD(g.model, input, output);

    totals.requests += g._count.id;
    totals.inputTokens += input;
    totals.outputTokens += output;
    totals.totalTokens += total;
    totals.costUSD += cost.usd;
    if (!cost.priced) totals.unpricedRequests += g._count.id;

    bump(featureMap, g.feature, g.feature, undefined, g, cost);
    bump(modelMap, `${g.providerType}:${g.model}`, g.model, g.providerType, g, cost);
    bump(tenantMap, g.tenantId ?? "—", g.tenantId ?? "Sin tenant", undefined, g, cost);
  }

  // Enriquecer nombres de tenant.
  const tenantIds = Array.from(tenantMap.keys()).filter((id) => id !== "—");
  if (tenantIds.length > 0) {
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, name: true, slug: true },
    });
    for (const t of tenants) {
      const row = tenantMap.get(t.id);
      if (row) {
        row.label = t.name;
        row.sublabel = t.slug;
      }
    }
  }

  const byCost = (a: UsageRow, b: UsageRow) => b.costUSD - a.costUSD || b.totalTokens - a.totalTokens;

  return {
    totals,
    byFeature: Array.from(featureMap.values()).sort(byCost),
    byModel: Array.from(modelMap.values()).sort(byCost),
    byTenant: Array.from(tenantMap.values()).sort(byCost),
  };
}
