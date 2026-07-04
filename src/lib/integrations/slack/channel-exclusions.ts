/**
 * Gobernanza de lectura del bot (Fase 16, B6) — lista de canales EXCLUIDOS.
 *
 * OPAI nunca lee (B8) ni usa como contexto (Channel Expert) los canales de esta
 * lista. Se guarda por tenant en `Setting` (category "slack_governance", key
 * `slack_governance.excluded_channels` = JSON array de channelIds). Cache 5 min.
 */

import { prisma } from "@/lib/prisma";

const KEY = "slack_governance.excluded_channels";
const CATEGORY = "slack_governance";
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: Set<string>; expires: number }>();

export function invalidateChannelExclusions(tenantId: string): void {
  cache.delete(tenantId);
}

export async function getExcludedChannelIds(tenantId: string): Promise<Set<string>> {
  const cached = cache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.value;

  const row = await prisma.setting.findUnique({
    where: { tenantId_key: { tenantId, key: KEY } },
    select: { value: true },
  }).catch(() => null);

  let ids: string[] = [];
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value);
      if (Array.isArray(parsed)) ids = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      /* valor corrupto → lista vacía (fail-open a lectura, la exclusión es opt-in) */
    }
  }
  const set = new Set(ids);
  cache.set(tenantId, { value: set, expires: Date.now() + CACHE_TTL_MS });
  return set;
}

export async function isChannelExcluded(tenantId: string, channelId: string): Promise<boolean> {
  if (!channelId) return false;
  return (await getExcludedChannelIds(tenantId)).has(channelId);
}

export async function setExcludedChannelIds(tenantId: string, channelIds: string[]): Promise<string[]> {
  const clean = [...new Set(channelIds.filter((x) => typeof x === "string" && x.trim()))].map((x) => x.trim());
  const value = JSON.stringify(clean);
  await prisma.setting.upsert({
    where: { tenantId_key: { tenantId, key: KEY } },
    update: { value, type: "json", category: CATEGORY },
    create: { tenantId, key: KEY, value, type: "json", category: CATEGORY },
  });
  invalidateChannelExclusions(tenantId);
  return clean;
}
