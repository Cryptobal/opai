/**
 * Planificador puro de la migración F1 (billingStatus + catálogo).
 * El script `scripts/migrate-platform-lifecycle.ts` aplica (o dry-run)
 * estos intents. No auto-suspende a nadie por fechas.
 */

import { addDaysChile } from "@/lib/dates-cl";
import {
  normalizeBillingStatus,
  type BillingStatus,
} from "@/lib/platform/tenant-lifecycle";

/** Add-ons que siguen ofreciéndose sobre Profesional (addendum B.7). */
export const OPTIONAL_ADDON_MODULE_KEYS = [
  "crm",
  "cpq",
  "finanzas",
  "payroll",
  "ops_rondas",
  "ops_inventario",
  "ops_camaras",
  "face_id",
  "control_acceso",
  "app_nativa",
  "white_label",
  "psych",
  "ia_operacional",
  "control_nocturno",
  "fiscalizacion",
  "portal_cliente",
  "ats",
] as const;

export const OPTIONAL_ADDON_MODULE_KEY_SET = new Set<string>(OPTIONAL_ADDON_MODULE_KEYS);

export interface MigrationTenantInput {
  id: string;
  slug: string;
  active: boolean;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  plan: {
    id: string;
    plan: string;
    billingStatus: string;
    trialEndsAt: Date | null;
    graceEndsAt: Date | null;
    statusChangedAt: Date | null;
    statusReason: string | null;
    customBaseMinimum: string | number | null;
  } | null;
}

export interface BillingMigrationIntent {
  tenantId: string;
  slug: string;
  kind: "create_plan" | "update" | "noop";
  billingStatus: BillingStatus;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  statusReason: string | null;
  statusChangedAt: Date | null;
  createPlanSlug: string | null;
  notes: string[];
}

export function isEnterpriseIncomplete(
  planSlug: string | null | undefined,
  customBaseMinimum: string | number | null | undefined,
): boolean {
  if ((planSlug ?? "").toLowerCase() !== "enterprise") return false;
  return customBaseMinimum == null || customBaseMinimum === "";
}

export function shouldDeactivateAddon(
  moduleKey: string | null | undefined,
  profesionalModules: Set<string>,
): boolean {
  if (!moduleKey) return true;
  if (profesionalModules.has(moduleKey)) return true;
  return !OPTIONAL_ADDON_MODULE_KEY_SET.has(moduleKey);
}

/**
 * Calcula el estado persistido post-migración.
 * - `trial` → `trialing`
 * - trial vencido → `trial_expired` + `graceEndsAt = now + graceDays` (nunca `suspended`)
 * - kill switch `Tenant.active=false` → `suspended` (conserva `cancelled`)
 * - sin plan → crea uno `free` `active`/`suspended` según kill switch
 */
export function computeBillingMigration(
  tenant: MigrationTenantInput,
  now: Date,
  graceDays: number,
): BillingMigrationIntent {
  const notes: string[] = [];

  if (!tenant.plan) {
    const billingStatus: BillingStatus = tenant.active ? "active" : "suspended";
    notes.push("missing_plan: se crea TenantPlan slug=free");
    if (!tenant.active) notes.push("kill_switch: Tenant.active=false → suspended");
    return {
      tenantId: tenant.id,
      slug: tenant.slug,
      kind: "create_plan",
      billingStatus,
      trialEndsAt: null,
      graceEndsAt: null,
      statusReason: tenant.suspendedReason ?? "lifecycle.migrated.missing_plan",
      statusChangedAt: now,
      createPlanSlug: "free",
      notes,
    };
  }

  const current = tenant.plan;
  const normalized = normalizeBillingStatus(current.billingStatus);
  let billingStatus: BillingStatus = normalized ?? "active";
  if (!normalized) {
    notes.push(`status_desconocido:${current.billingStatus} → active`);
  } else if (current.billingStatus !== billingStatus) {
    notes.push(`alias:${current.billingStatus}→${billingStatus}`);
  }

  let trialEndsAt = current.trialEndsAt;
  let graceEndsAt = current.graceEndsAt;
  let statusReason = current.statusReason;
  let changed = current.billingStatus !== billingStatus;

  if (!tenant.active) {
    if (billingStatus !== "cancelled") {
      if (billingStatus !== "suspended") {
        notes.push("kill_switch: Tenant.active=false → suspended");
        billingStatus = "suspended";
        changed = true;
      }
      if (!statusReason && tenant.suspendedReason) {
        statusReason = tenant.suspendedReason;
        changed = true;
      }
    }
  } else if (billingStatus === "trialing" && trialEndsAt && trialEndsAt.getTime() <= now.getTime()) {
    billingStatus = "trial_expired";
    if (!graceEndsAt) {
      graceEndsAt = addDaysChile(now, graceDays);
    }
    statusReason = statusReason ?? "lifecycle.migrated.trial_expired";
    notes.push("trial_vencido → trial_expired (sin suspender)");
    changed = true;
  } else if (billingStatus === "trial_expired" && !graceEndsAt) {
    graceEndsAt = addDaysChile(now, graceDays);
    notes.push("trial_expired sin gracia: se asigna graceEndsAt");
    changed = true;
  }

  if (isEnterpriseIncomplete(current.plan, current.customBaseMinimum) && billingStatus === "active") {
    notes.push("enterprise_sin_precio");
  }

  return {
    tenantId: tenant.id,
    slug: tenant.slug,
    kind: changed ? "update" : "noop",
    billingStatus,
    trialEndsAt,
    graceEndsAt,
    statusReason,
    statusChangedAt: changed ? now : current.statusChangedAt,
    createPlanSlug: null,
    notes,
  };
}
