/**
 * Configuración del onboarding automático al ganar un negocio (por tenant).
 *
 * El disparo del onboarding al pasar un deal a "ganado" (crear playbook + abrir
 * el modal) viene APAGADO por defecto: marcar un negocio como ganado NO crea
 * onboarding ni tickets salvo que el tenant lo active explícitamente. El módulo
 * de onboarding queda intacto, solo dormido y reactivable con este flag.
 *
 * Se guarda en la tabla genérica `Setting` (category "onboarding"), mismo patrón
 * que `integrations/slack/deal-rooms/config.ts`.
 */

import { prisma } from "@/lib/prisma";

export interface OnboardingConfig {
  /** Si false (default), ganar un negocio NO crea onboarding ni abre el modal. */
  onWonEnabled: boolean;
}

const DEFAULTS: OnboardingConfig = {
  onWonEnabled: false,
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: OnboardingConfig; expires: number }>();

const KEY = {
  onWonEnabled: "onboarding.on_won_enabled",
} as const;

const CATEGORY = "onboarding";

export function invalidateOnboardingConfig(tenantId: string): void {
  cache.delete(tenantId);
}

export async function getOnboardingConfig(tenantId: string): Promise<OnboardingConfig> {
  const cached = cache.get(tenantId);
  if (cached && cached.expires > Date.now()) return cached.value;

  const rows = await prisma.setting.findMany({
    where: { tenantId, category: CATEGORY, key: { in: Object.values(KEY) } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const cfg: OnboardingConfig = {
    onWonEnabled: parseBoolOr(map.get(KEY.onWonEnabled), DEFAULTS.onWonEnabled),
  };
  cache.set(tenantId, { value: cfg, expires: Date.now() + CACHE_TTL_MS });
  return cfg;
}

export async function setOnboardingConfig(tenantId: string, partial: Partial<OnboardingConfig>): Promise<OnboardingConfig> {
  const updates: Array<{ key: string; value: string; type: string }> = [];
  if (partial.onWonEnabled !== undefined) updates.push({ key: KEY.onWonEnabled, value: String(partial.onWonEnabled), type: "boolean" });

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
  invalidateOnboardingConfig(tenantId);
  return getOnboardingConfig(tenantId);
}

function parseBoolOr(s: string | undefined, fallback: boolean): boolean {
  if (s === undefined) return fallback;
  return s === "true" || s === "1";
}
