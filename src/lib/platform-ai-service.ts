/**
 * Platform-level AI service.
 *
 * Reads the centralized AI provider config (managed by Platform Admin)
 * and exposes helpers for all AI consumers in the app.
 */

import { prisma } from "@/lib/prisma";
import { decryptApiKey } from "@/lib/ai-encryption";
import { KNOWN_PROVIDERS } from "@/lib/ai-known-models";

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
        metadata: params.metadata ?? undefined,
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
