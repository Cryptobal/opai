import {
  deriveTenantAccess,
  uiCompatStatus,
  type TenantAccessSnapshot,
} from "@/lib/platform/tenant-lifecycle";
import type { LifecycleSettings } from "@/lib/platform/settings";
import {
  computeTenantMonthly,
  serializeTenantMonthly,
  type PricingAddonInput,
  type PricingPackInput,
  type PricingPlanInput,
} from "@/lib/platform/pricing";
import {
  monthlyDisplay,
  tenantStatusUi,
  type MonthlyDisplay,
  type StatusVariant,
} from "@/lib/platform/status-ui";

export interface PlatformTenantRow {
  id: string;
  name: string;
  slug: string;
  companyRut: string | null;
  plan: string | null;
  lifecycleState: string;
  exempt: boolean;
  missingPlan: boolean;
  statusLabel: string;
  statusVariant: StatusVariant;
  status: "trial" | "active" | "suspended";
  activeGuards: number;
  maxGuards: number;
  adminCount: number;
  monthly: MonthlyDisplay;
  lastActivityAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  usage30d: null;
  pricingComplete: boolean;
  daysLeft: number | null;
  countsTowardMrr: boolean;
  monthlyTotal: number | null;
  currency: string;
}

export function lastLoginOf(
  admins: { lastLoginAt: Date | null }[],
): Date | null {
  return admins.reduce<Date | null>((latest, a) => {
    if (!a.lastLoginAt) return latest;
    if (!latest || a.lastLoginAt > latest) return a.lastLoginAt;
    return latest;
  }, null);
}

export function serializePlatformTenant(input: {
  id: string;
  name: string;
  slug: string;
  companyRut: string | null;
  active: boolean;
  suspendedAt: Date | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  plan: PricingPlanInput & {
    billingStatus: string;
    trialEndsAt: Date | null;
    graceEndsAt: Date | null;
    statusChangedAt: Date | null;
    maxGuards: number;
  } | null;
  addons: PricingAddonInput[];
  packs: PricingPackInput[];
  admins: { lastLoginAt: Date | null }[];
  activeGuards: number;
  now: Date;
  settings: LifecycleSettings;
  ufValue: number | null;
}): PlatformTenantRow {
  const snapshot: TenantAccessSnapshot = {
    tenantId: input.id,
    slug: input.slug,
    active: input.active,
    suspendedAt: input.suspendedAt,
    plan: input.plan
      ? {
          billingStatus: input.plan.billingStatus,
          trialEndsAt: input.plan.trialEndsAt,
          graceEndsAt: input.plan.graceEndsAt,
          statusChangedAt: input.plan.statusChangedAt,
        }
      : null,
  };
  const access = deriveTenantAccess(snapshot, input.now, input.settings);
  const ui = tenantStatusUi(access);
  const price = input.plan
    ? serializeTenantMonthly(
        computeTenantMonthly(input.plan, input.addons, input.packs, input.activeGuards),
        input.ufValue,
      )
    : null;
  const login = lastLoginOf(input.admins);
  const lastActivity =
    input.lastActivityAt && login
      ? input.lastActivityAt > login
        ? input.lastActivityAt
        : login
      : input.lastActivityAt ?? login;

  return {
    id: input.id,
    name: input.name,
    slug: input.slug,
    companyRut: input.companyRut,
    plan: input.plan?.plan ?? null,
    lifecycleState: access.state,
    exempt: access.exempt,
    missingPlan: access.missingPlan,
    statusLabel: ui.statusLabel,
    statusVariant: ui.statusVariant,
    status: uiCompatStatus(access),
    activeGuards: input.activeGuards,
    maxGuards: input.plan?.maxGuards ?? 0,
    adminCount: input.admins.length,
    monthly: monthlyDisplay(access, price),
    lastActivityAt: lastActivity?.toISOString() ?? null,
    lastLoginAt: login?.toISOString() ?? null,
    createdAt: input.createdAt.toISOString(),
    usage30d: null,
    pricingComplete: price?.complete ?? true,
    daysLeft: access.daysLeft ?? null,
    countsTowardMrr: price?.countsTowardMrr ?? false,
    monthlyTotal: price?.total ?? null,
    currency: price?.currency ?? "UF",
  };
}

export function sortPlatformTenantRows(
  rows: PlatformTenantRow[],
  sort: string,
  order: "asc" | "desc",
): PlatformTenantRow[] {
  const dir = order === "asc" ? 1 : -1;
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp = 0;
    if (sort === "name") cmp = a.name.localeCompare(b.name, "es");
    else if (sort === "plan") cmp = (a.plan ?? "").localeCompare(b.plan ?? "");
    else if (sort === "lastActivity") {
      cmp = (a.lastActivityAt ?? "").localeCompare(b.lastActivityAt ?? "");
    } else {
      cmp = a.createdAt.localeCompare(b.createdAt);
    }
    return cmp * dir;
  });
  return copy;
}
