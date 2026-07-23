/**
 * Tenant AI Routing (por categoría)
 *
 * Permite que cada tenant elija proveedor + modelo POR CATEGORÍA de IA
 * (ver `ai-feature-categories.ts`). Se guarda como un único Setting JSON por
 * tenant (`ai.routing`) → NO requiere migración de schema.
 *
 * Forma del valor:
 *   { "vision": { "providerType": "anthropic", "modelId": "claude-..." }, ... }
 *
 * Una categoría sin entrada usa el proveedor por defecto del tenant.
 */

import { prisma } from "@/lib/prisma";
import { isValidAiModule, type AiModuleId } from "@/lib/ai/ai-feature-modules";

export type AiModuleRoute = { providerType: string; modelId: string };
export type TenantAiRouting = Partial<Record<AiModuleId, AiModuleRoute>>;

const SETTING_KEY = "ai.routing";
const CACHE_TTL = 60 * 1000; // 1 min
const cache = new Map<string, { routing: TenantAiRouting; ts: number }>();

export function clearTenantAiRoutingCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/** Normaliza/valida un objeto de ruteo crudo desde JSON o request. */
export function sanitizeRouting(raw: unknown): TenantAiRouting {
  const out: TenantAiRouting = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [mod, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidAiModule(mod)) continue;
    if (!val || typeof val !== "object") continue;
    const v = val as Record<string, unknown>;
    const providerType = typeof v.providerType === "string" ? v.providerType.trim() : "";
    const modelId = typeof v.modelId === "string" ? v.modelId.trim() : "";
    // Ambos vacíos = "usar por defecto" → se omite.
    if (providerType && modelId) {
      out[mod as AiModuleId] = { providerType, modelId };
    }
  }
  return out;
}

export async function getTenantAiRouting(tenantId: string): Promise<TenantAiRouting> {
  if (!tenantId) return {};
  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.routing;

  let routing: TenantAiRouting = {};
  try {
    const row = await prisma.setting.findUnique({
      where: { tenantId_key: { tenantId, key: SETTING_KEY } },
    });
    if (row?.value) {
      routing = sanitizeRouting(JSON.parse(row.value));
    }
  } catch (err) {
    console.warn("[tenant-ai-routing] Error leyendo ruteo del tenant", tenantId, err);
  }

  cache.set(tenantId, { routing, ts: Date.now() });
  return routing;
}

export async function setTenantAiRouting(
  tenantId: string,
  raw: unknown,
): Promise<TenantAiRouting> {
  const routing = sanitizeRouting(raw);
  const value = JSON.stringify(routing);
  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId, key: SETTING_KEY } },
    update: { value, type: "json" },
    create: { tenantId, key: SETTING_KEY, value, type: "json", category: "ai" },
  });
  clearTenantAiRoutingCache(tenantId);
  return routing;
}
