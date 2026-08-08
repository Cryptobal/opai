/**
 * Límites de plan por tenant (maxGuards / maxAdmins).
 *
 * Fuente de verdad: TenantPlan. PlanCatalog solo como fallback si el campo
 * del plan del tenant no está disponible. 0 / null / negativo = sin límite.
 */

import { prisma } from "@/lib/prisma";

export type PlanLimitOk = { ok: true };
export type PlanLimitDenied = {
  ok: false;
  limit: number;
  current: number;
  plan: string;
};
export type PlanLimitResult = PlanLimitOk | PlanLimitDenied;

type ResolvedPlanLimits = {
  plan: string;
  maxGuards: number | null;
  maxAdmins: number | null;
};

async function resolveTenantPlanLimits(
  tenantId: string,
): Promise<ResolvedPlanLimits | null> {
  const tenantPlan = await prisma.tenantPlan.findUnique({
    where: { tenantId },
    select: {
      plan: true,
      maxGuards: true,
      maxAdmins: true,
      planCatalogId: true,
    },
  });
  if (!tenantPlan) return null;

  let catalogMaxGuards: number | null = null;
  let catalogMaxAdmins: number | null = null;

  if (tenantPlan.planCatalogId) {
    const catalog = await prisma.planCatalog.findUnique({
      where: { id: tenantPlan.planCatalogId },
      select: { maxGuards: true, maxAdmins: true },
    });
    if (catalog) {
      catalogMaxGuards = catalog.maxGuards;
      catalogMaxAdmins = catalog.maxAdmins;
    }
  } else if (tenantPlan.plan) {
    const catalog = await prisma.planCatalog.findUnique({
      where: { slug: tenantPlan.plan },
      select: { maxGuards: true, maxAdmins: true },
    });
    if (catalog) {
      catalogMaxGuards = catalog.maxGuards;
      catalogMaxAdmins = catalog.maxAdmins;
    }
  }

  return {
    plan: tenantPlan.plan,
    maxGuards: tenantPlan.maxGuards ?? catalogMaxGuards,
    maxAdmins: tenantPlan.maxAdmins ?? catalogMaxAdmins,
  };
}

/** Interpreta 0 / null / negativo como sin tope. */
export function isUnlimitedPlanLimit(limit: number | null | undefined): boolean {
  return limit == null || limit <= 0;
}

export async function countActiveGuards(tenantId: string): Promise<number> {
  return prisma.opsGuardia.count({
    where: { tenantId, status: "active" },
  });
}

export async function countAdminsTowardLimit(tenantId: string): Promise<number> {
  const now = new Date();
  const [activeAdmins, pendingInvites] = await Promise.all([
    prisma.admin.count({
      where: { tenantId, status: "active" },
    }),
    prisma.userInvitation.count({
      where: {
        tenantId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gte: now },
      },
    }),
  ]);
  return activeAdmins + pendingInvites;
}

export async function assertGuardLimit(
  tenantId: string,
  incoming = 1,
): Promise<PlanLimitResult> {
  const resolved = await resolveTenantPlanLimits(tenantId);
  if (!resolved) return { ok: true };

  const limit = resolved.maxGuards;
  if (isUnlimitedPlanLimit(limit)) return { ok: true };

  const current = await countActiveGuards(tenantId);
  if (current + incoming > limit!) {
    return {
      ok: false,
      limit: limit!,
      current,
      plan: resolved.plan,
    };
  }
  return { ok: true };
}

export async function assertAdminLimit(
  tenantId: string,
  incoming = 1,
): Promise<PlanLimitResult> {
  const resolved = await resolveTenantPlanLimits(tenantId);
  if (!resolved) return { ok: true };

  const limit = resolved.maxAdmins;
  if (isUnlimitedPlanLimit(limit)) return { ok: true };

  const current = await countAdminsTowardLimit(tenantId);
  if (current + incoming > limit!) {
    return {
      ok: false,
      limit: limit!,
      current,
      plan: resolved.plan,
    };
  }
  return { ok: true };
}

export function planLimitErrorMessage(
  kind: "guardias" | "usuarios",
  result: PlanLimitDenied,
): string {
  return `Alcanzaste el límite de ${result.limit} ${kind} de tu plan (${result.plan}). Contacta a tu administrador para ampliarlo.`;
}
