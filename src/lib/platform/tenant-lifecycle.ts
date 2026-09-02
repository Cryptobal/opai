/**
 * Ciclo de vida comercial del tenant.
 * Única función que interpreta billingStatus + fechas: resolveTenantAccess /
 * deriveTenantAccess. applyTransition persiste transiciones válidas.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDaysChile, chileCalendarDaysUntil } from "@/lib/dates-cl";
import { logPlatformAction, type PlatformActorType } from "@/lib/platform/audit";
import {
  getLifecycleSettings,
  type LifecycleSettings,
} from "@/lib/platform/settings";

export const BILLING_STATUSES = [
  "trialing",
  "trial_expired",
  "active",
  "past_due",
  "suspended",
  "cancelled",
] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];
export type AccessMode = "full" | "read_only" | "blocked";
export type TenantBannerKey = "trial_expiring" | "trial_expired" | "past_due";
export type LifecycleAction =
  | "activate"
  | "extend_trial"
  | "mark_past_due"
  | "suspend"
  | "reactivate"
  | "cancel";

export const LIFECYCLE_ACTIONS: Record<LifecycleAction, BillingStatus> = {
  activate: "active",
  extend_trial: "trialing",
  mark_past_due: "past_due",
  suspend: "suspended",
  reactivate: "active",
  cancel: "cancelled",
};

const ALLOWED_TRANSITIONS: Record<BillingStatus, BillingStatus[]> = {
  trialing: ["trial_expired", "active", "suspended", "cancelled"],
  trial_expired: ["trialing", "active", "suspended", "cancelled"],
  active: ["past_due", "suspended", "cancelled"],
  past_due: ["active", "suspended", "cancelled"],
  suspended: ["active"],
  cancelled: ["active"],
};

const LEGACY_STATUS: Record<string, BillingStatus> = {
  trial: "trialing",
  trialing: "trialing",
  trial_expired: "trial_expired",
  active: "active",
  past_due: "past_due",
  suspended: "suspended",
  cancelled: "cancelled",
};

export class InvalidLifecycleTransitionError extends Error {
  readonly code = "INVALID_LIFECYCLE_TRANSITION";
  constructor(
    readonly from: BillingStatus,
    readonly to: BillingStatus,
  ) {
    super(`Transición no permitida: ${from} → ${to}`);
    this.name = "InvalidLifecycleTransitionError";
  }
}

export class PricingIncompleteError extends Error {
  readonly code = "PRICING_INCOMPLETE";
  constructor() {
    super("No se puede activar un plan enterprise sin precio negociado (customBaseMinimum).");
    this.name = "PricingIncompleteError";
  }
}

export interface TenantAccess {
  state: BillingStatus;
  persistedState: BillingStatus | null;
  mode: AccessMode;
  marcacionAllowed: boolean;
  bannerKey?: TenantBannerKey;
  daysLeft?: number;
  exempt: boolean;
  missingPlan: boolean;
  lifecycleEnabled: boolean;
}

export interface TenantAccessSnapshot {
  tenantId: string;
  slug: string;
  active: boolean;
  suspendedAt: Date | null;
  plan: {
    billingStatus: string;
    trialEndsAt: Date | null;
    graceEndsAt: Date | null;
    statusChangedAt: Date | null;
  } | null;
}

export function isBillingStatus(value: string): value is BillingStatus {
  return (BILLING_STATUSES as readonly string[]).includes(value);
}

export function normalizeBillingStatus(raw: string | null | undefined): BillingStatus | null {
  if (!raw) return null;
  return LEGACY_STATUS[raw] ?? (isBillingStatus(raw) ? raw : null);
}

export function isTransitionAllowed(from: BillingStatus, to: BillingStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function actionToStatus(action: string): BillingStatus | null {
  if (action in LIFECYCLE_ACTIONS) return LIFECYCLE_ACTIONS[action as LifecycleAction];
  return null;
}

function daysUntil(target: Date | null | undefined, now: Date): number | undefined {
  if (!target) return undefined;
  return chileCalendarDaysUntil(target, now);
}

function withinMarcacionGrace(
  since: Date | null,
  now: Date,
  graceDays: number,
): boolean {
  if (!since) return false;
  const ends = addDaysChile(since, graceDays);
  return now < ends;
}

export function deriveTenantAccess(
  snapshot: TenantAccessSnapshot,
  now: Date,
  settings: LifecycleSettings,
): TenantAccess {
  const persisted = normalizeBillingStatus(snapshot.plan?.billingStatus ?? null);
  const missingPlan = !snapshot.plan;
  const exempt = settings.exemptSlugs.includes(snapshot.slug);

  const base = (partial: Partial<TenantAccess> & Pick<TenantAccess, "state" | "mode">): TenantAccess => ({
    persistedState: persisted,
    marcacionAllowed: partial.marcacionAllowed ?? partial.mode !== "blocked",
    exempt,
    missingPlan,
    lifecycleEnabled: settings.enabled,
    ...partial,
  });

  if (!snapshot.active) {
    const since = snapshot.suspendedAt ?? snapshot.plan?.statusChangedAt ?? null;
    const marcacionAllowed = withinMarcacionGrace(
      since,
      now,
      settings.suspendedMarcacionGraceDays,
    );
    return base({
      state: persisted === "cancelled" ? "cancelled" : "suspended",
      mode: "blocked",
      marcacionAllowed: persisted === "cancelled" ? false : marcacionAllowed,
    });
  }

  if (!settings.enabled || exempt || missingPlan) {
    return base({
      state: persisted ?? "active",
      mode: "full",
      marcacionAllowed: true,
    });
  }

  let state: BillingStatus = persisted ?? "active";
  const trialEndsAt = snapshot.plan?.trialEndsAt ?? null;
  const graceEndsAt = snapshot.plan?.graceEndsAt ?? null;

  if (state === "trialing" && trialEndsAt && trialEndsAt.getTime() <= now.getTime()) {
    state = "trial_expired";
  }
  if (state === "trial_expired" && graceEndsAt && graceEndsAt.getTime() <= now.getTime()) {
    state = "suspended";
  }
  if (state === "past_due" && graceEndsAt && graceEndsAt.getTime() <= now.getTime()) {
    state = "suspended";
  }

  switch (state) {
    case "trialing": {
      const left = daysUntil(trialEndsAt, now);
      const reminder = left != null && settings.trialReminderDays.includes(left);
      return base({
        state,
        mode: "full",
        marcacionAllowed: true,
        bannerKey: reminder ? "trial_expiring" : undefined,
        daysLeft: left,
      });
    }
    case "trial_expired": {
      const left = daysUntil(graceEndsAt, now);
      return base({
        state,
        mode: "read_only",
        marcacionAllowed: true,
        bannerKey: "trial_expired",
        daysLeft: left,
      });
    }
    case "active":
      return base({ state, mode: "full", marcacionAllowed: true });
    case "past_due": {
      const left = daysUntil(graceEndsAt, now);
      return base({
        state,
        mode: "full",
        marcacionAllowed: true,
        bannerKey: "past_due",
        daysLeft: left,
      });
    }
    case "suspended": {
      const since = snapshot.suspendedAt ?? snapshot.plan?.statusChangedAt ?? null;
      return base({
        state,
        mode: "blocked",
        marcacionAllowed: withinMarcacionGrace(
          since,
          now,
          settings.suspendedMarcacionGraceDays,
        ),
      });
    }
    case "cancelled":
      return base({ state, mode: "blocked", marcacionAllowed: false });
    default: {
      const _exhaustive: never = state;
      return _exhaustive;
    }
  }
}

export function uiCompatStatus(access: TenantAccess): "trial" | "active" | "suspended" {
  if (access.mode === "blocked" || access.state === "suspended" || access.state === "cancelled") {
    return "suspended";
  }
  if (access.state === "trialing" || access.state === "trial_expired") return "trial";
  return "active";
}

export async function resolveTenantAccess(
  tenantId: string,
  now: Date = new Date(),
): Promise<TenantAccess> {
  const [settings, tenant] = await Promise.all([
    getLifecycleSettings(),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        active: true,
        suspendedAt: true,
        plan: {
          select: {
            billingStatus: true,
            trialEndsAt: true,
            graceEndsAt: true,
            statusChangedAt: true,
          },
        },
      },
    }),
  ]);

  if (!tenant) {
    return {
      state: "cancelled",
      persistedState: null,
      mode: "blocked",
      marcacionAllowed: false,
      exempt: false,
      missingPlan: true,
      lifecycleEnabled: settings.enabled,
    };
  }

  const access = deriveTenantAccess(
    {
      tenantId: tenant.id,
      slug: tenant.slug,
      active: tenant.active,
      suspendedAt: tenant.suspendedAt,
      plan: tenant.plan,
    },
    now,
    settings,
  );

  if (access.missingPlan && settings.enabled && !access.exempt) {
    warnMissingPlan(tenant.id).catch(() => undefined);
  }

  return access;
}

async function warnMissingPlan(tenantId: string): Promise<void> {
  const existing = await prisma.platformAuditLog.findFirst({
    where: { tenantId, action: "lifecycle.missing_plan" },
    select: { id: true },
  });
  if (existing) return;
  console.warn("[lifecycle] tenant without TenantPlan", { tenantId });
  await logPlatformAction({
    actorType: "system",
    actorId: "lifecycle",
    actorEmail: "system:lifecycle",
    action: "lifecycle.missing_plan",
    tenantId,
    targetType: "Tenant",
    targetId: tenantId,
  });
}

export type LifecycleTx = Prisma.TransactionClient;

export interface ApplyTransitionInput {
  tenantId: string;
  to: BillingStatus;
  reason: string;
  actorType: PlatformActorType;
  actorId?: string | null;
  actorEmail?: string | null;
  trialEndsAt?: Date | null;
  request?: Request | null;
  now?: Date;
}

export interface ApplyTransitionResult {
  from: BillingStatus;
  to: BillingStatus;
  plan: {
    billingStatus: string;
    trialEndsAt: Date | null;
    graceEndsAt: Date | null;
    statusChangedAt: Date | null;
    statusReason: string | null;
  };
  access: TenantAccess;
}

function graceFor(to: BillingStatus, settings: LifecycleSettings, now: Date): Date | null {
  if (to === "trial_expired") return addDaysChile(now, settings.trialGraceDays);
  if (to === "past_due") return addDaysChile(now, settings.pastDueGraceDays);
  return null;
}

export async function applyTransition(
  tx: LifecycleTx,
  input: ApplyTransitionInput,
): Promise<ApplyTransitionResult> {
  const now = input.now ?? new Date();
  const settings = await getLifecycleSettings();
  const tenant = await tx.tenant.findUnique({
    where: { id: input.tenantId },
    include: { plan: true },
  });
  if (!tenant) {
    throw new Error("Tenant no encontrado");
  }
  if (!tenant.plan) {
    throw new Error("Tenant sin plan");
  }

  const from = normalizeBillingStatus(tenant.plan.billingStatus) ?? "active";
  const to = input.to;
  if (!isTransitionAllowed(from, to)) {
    throw new InvalidLifecycleTransitionError(from, to);
  }

  const trialEndsAt =
    to === "trialing"
      ? (input.trialEndsAt ??
        new Date(now.getTime() + settings.trialDefaultDays * 24 * 60 * 60 * 1000))
      : tenant.plan.trialEndsAt;

  const graceEndsAt =
    to === "trial_expired" || to === "past_due"
      ? graceFor(to, settings, now)
      : null;

  const killSwitch = to === "suspended" || to === "cancelled";

  const updatedPlan = await tx.tenantPlan.update({
    where: { tenantId: input.tenantId },
    data: {
      billingStatus: to,
      trialEndsAt,
      graceEndsAt,
      statusChangedAt: now,
      statusReason: input.reason,
    },
  });

  await tx.tenant.update({
    where: { id: input.tenantId },
    data: killSwitch
      ? {
          active: false,
          suspendedAt: now,
          suspendedReason: input.reason,
        }
      : {
          active: true,
          suspendedAt: null,
          suspendedReason: null,
        },
  });

  await logPlatformAction(
    {
      actorType: input.actorType,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      action: "lifecycle.transition",
      tenantId: input.tenantId,
      targetType: "TenantPlan",
      targetId: updatedPlan.id,
      before: {
        billingStatus: tenant.plan.billingStatus,
        trialEndsAt: tenant.plan.trialEndsAt?.toISOString() ?? null,
        graceEndsAt: tenant.plan.graceEndsAt?.toISOString() ?? null,
        active: tenant.active,
      },
      after: {
        billingStatus: to,
        trialEndsAt: updatedPlan.trialEndsAt?.toISOString() ?? null,
        graceEndsAt: updatedPlan.graceEndsAt?.toISOString() ?? null,
        active: !killSwitch,
        reason: input.reason,
      },
      request: input.request,
    },
    tx,
  );

  const access = deriveTenantAccess(
    {
      tenantId: tenant.id,
      slug: tenant.slug,
      active: !killSwitch,
      suspendedAt: killSwitch ? now : null,
      plan: {
        billingStatus: to,
        trialEndsAt: updatedPlan.trialEndsAt,
        graceEndsAt: updatedPlan.graceEndsAt,
        statusChangedAt: updatedPlan.statusChangedAt,
      },
    },
    now,
    settings,
  );

  return {
    from,
    to,
    plan: {
      billingStatus: updatedPlan.billingStatus,
      trialEndsAt: updatedPlan.trialEndsAt,
      graceEndsAt: updatedPlan.graceEndsAt,
      statusChangedAt: updatedPlan.statusChangedAt,
      statusReason: updatedPlan.statusReason,
    },
    access,
  };
}

const ACTIVITY_THROTTLE_MS = 60 * 60 * 1000;

export async function touchTenantActivity(tenantId: string, now: Date = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - ACTIVITY_THROTTLE_MS);
  try {
    await prisma.tenant.updateMany({
      where: {
        id: tenantId,
        OR: [{ lastActivityAt: null }, { lastActivityAt: { lt: cutoff } }],
      },
      data: { lastActivityAt: now },
    });
  } catch (error) {
    console.warn("[lifecycle] touchTenantActivity failed:", error);
  }
}

export function serializeAccess(access: TenantAccess) {
  return {
    state: access.state,
    persistedState: access.persistedState,
    mode: access.mode,
    marcacionAllowed: access.marcacionAllowed,
    bannerKey: access.bannerKey ?? null,
    daysLeft: access.daysLeft ?? null,
    exempt: access.exempt,
    missingPlan: access.missingPlan,
  };
}
