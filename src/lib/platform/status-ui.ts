import type { TenantAccess } from "@/lib/platform/tenant-lifecycle";
import type { SerializedTenantMonthlyPrice } from "@/lib/platform/pricing";

export type StatusVariant = "ok" | "warn" | "danger" | "neutral" | "info" | "brand";
export type StatusFilter = "all" | "paying" | "trial" | "grace" | "suspended";

export const STATUS_FILTERS: StatusFilter[] = ["all", "paying", "trial", "grace", "suspended"];

export function isStatusFilter(value: string | null | undefined): value is StatusFilter {
  return value != null && (STATUS_FILTERS as readonly string[]).includes(value);
}

export interface TenantStatusUi {
  statusLabel: string;
  statusVariant: StatusVariant;
}

export function tenantStatusUi(access: TenantAccess): TenantStatusUi {
  if (access.exempt) return { statusLabel: "Exento", statusVariant: "neutral" };
  if (access.missingPlan) return { statusLabel: "Sin plan", statusVariant: "neutral" };
  switch (access.state) {
    case "trialing":
      return { statusLabel: "En trial", statusVariant: "warn" };
    case "trial_expired":
      return { statusLabel: "En gracia", statusVariant: "danger" };
    case "active":
      return { statusLabel: "Pagando", statusVariant: "ok" };
    case "past_due":
      return { statusLabel: "En mora", statusVariant: "danger" };
    case "suspended":
      return { statusLabel: "Suspendido", statusVariant: "danger" };
    case "cancelled":
      return { statusLabel: "Cancelado", statusVariant: "neutral" };
    default:
      return { statusLabel: access.state, statusVariant: "neutral" };
  }
}

export function planTintClass(plan: string): string {
  const slug = plan.toLowerCase();
  if (slug === "starter") return "bg-tint-sky text-tint-sky-fg";
  if (slug === "profesional") return "bg-tint-violet text-tint-violet-fg";
  if (slug === "enterprise") return "bg-tint-amber text-tint-amber-fg";
  return "";
}

export type MonthlyKind = "amount" | "pending" | "trial" | "exempt" | "empty";

export interface MonthlyDisplay {
  kind: MonthlyKind;
  text: string;
  total: number | null;
  currency: string;
  clpTotal: number | null;
}

export function monthlyDisplay(
  access: TenantAccess,
  price: SerializedTenantMonthlyPrice | null,
): MonthlyDisplay {
  if (access.exempt) {
    return { kind: "exempt", text: "Exento", total: null, currency: "UF", clpTotal: null };
  }
  if (access.state === "trialing" || access.state === "trial_expired") {
    return { kind: "trial", text: "—", total: null, currency: price?.currency ?? "UF", clpTotal: null };
  }
  if (!price) {
    return { kind: "empty", text: "—", total: null, currency: "UF", clpTotal: null };
  }
  if (!price.complete) {
    return {
      kind: "pending",
      text: "Precio pendiente",
      total: null,
      currency: price.currency,
      clpTotal: null,
    };
  }
  return {
    kind: "amount",
    text: `UF ${price.total.toFixed(2)}`,
    total: price.total,
    currency: price.currency,
    clpTotal: price.clpTotal,
  };
}

export function matchesStatusFilter(state: string, exempt: boolean, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "paying") return state === "active" && !exempt;
  if (filter === "trial") return state === "trialing";
  if (filter === "grace") return state === "trial_expired" || state === "past_due";
  if (filter === "suspended") return state === "suspended" || state === "cancelled";
  return true;
}

export function emptyStatusCounts(): Record<StatusFilter, number> {
  return { all: 0, paying: 0, trial: 0, grace: 0, suspended: 0 };
}

export function tallyStatusCounts(
  rows: { lifecycleState: string; exempt: boolean }[],
): Record<StatusFilter, number> {
  const counts = emptyStatusCounts();
  counts.all = rows.length;
  for (const row of rows) {
    if (matchesStatusFilter(row.lifecycleState, row.exempt, "paying")) counts.paying += 1;
    if (matchesStatusFilter(row.lifecycleState, row.exempt, "trial")) counts.trial += 1;
    if (matchesStatusFilter(row.lifecycleState, row.exempt, "grace")) counts.grace += 1;
    if (matchesStatusFilter(row.lifecycleState, row.exempt, "suspended")) counts.suspended += 1;
  }
  return counts;
}
