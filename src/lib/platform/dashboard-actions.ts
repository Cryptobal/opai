export type DashboardActionKind =
  | "upgrade_request"
  | "trial_expiring_empty"
  | "trial_expired_inactive"
  | "pricing_incomplete";

export type DashboardActionLink = { label: string; href: string };

export interface DashboardAction {
  kind: DashboardActionKind;
  tenantId: string;
  text: string;
  primary: DashboardActionLink;
  secondary?: DashboardActionLink;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIONS = 5;

export interface DashboardActionTenant {
  id: string;
  name: string;
  lifecycleState: string;
  daysLeft: number | null;
  activeGuards: number;
  lastLoginAt: Date | null;
  createdAt: Date;
  pricingComplete: boolean;
  exempt: boolean;
}

export interface DashboardUpgradeRequest {
  id: string;
  tenantId: string;
  tenantName: string;
  requestedPlan: string | null;
}

export function buildDashboardActions(input: {
  upgradeRequests: DashboardUpgradeRequest[];
  tenants: DashboardActionTenant[];
  now: Date;
}): DashboardAction[] {
  const actions: DashboardAction[] = [];

  for (const req of input.upgradeRequests) {
    if (actions.length >= MAX_ACTIONS) break;
    const plan = req.requestedPlan ? ` a ${req.requestedPlan}` : "";
    actions.push({
      kind: "upgrade_request",
      tenantId: req.tenantId,
      text: `${req.tenantName}: solicitud de upgrade${plan} abierta`,
      primary: {
        label: "Ver ficha",
        href: `/platform/tenants/${req.tenantId}?tab=plan`,
      },
    });
  }

  for (const t of input.tenants) {
    if (actions.length >= MAX_ACTIONS) break;
    if (t.exempt) continue;
    if (t.lifecycleState !== "active" || t.pricingComplete) continue;
    actions.push({
      kind: "pricing_incomplete",
      tenantId: t.id,
      text: `${t.name}: plan activo sin precio completo`,
      primary: {
        label: "Configurar precio",
        href: `/platform/tenants/${t.id}?tab=plan`,
      },
    });
  }

  for (const t of input.tenants) {
    if (actions.length >= MAX_ACTIONS) break;
    if (t.lifecycleState !== "trialing") continue;
    if (t.daysLeft == null || t.daysLeft < 0 || t.daysLeft > 7) continue;
    if (t.activeGuards > 0) continue;
    actions.push({
      kind: "trial_expiring_empty",
      tenantId: t.id,
      text: `${t.name}: trial vence en ${t.daysLeft} día${t.daysLeft === 1 ? "" : "s"} y no tiene guardias`,
      primary: {
        label: "Ver ficha",
        href: `/platform/tenants/${t.id}`,
      },
    });
  }

  for (const t of input.tenants) {
    if (actions.length >= MAX_ACTIONS) break;
    if (t.lifecycleState !== "trial_expired") continue;
    const last = t.lastLoginAt ?? t.createdAt;
    if (input.now.getTime() - last.getTime() < 14 * DAY_MS) continue;
    actions.push({
      kind: "trial_expired_inactive",
      tenantId: t.id,
      text: `${t.name}: trial vencido sin login en 14 días o más`,
      primary: {
        label: "Ver ciclo de vida",
        href: `/platform/tenants/${t.id}?tab=resumen`,
      },
    });
  }

  return actions.slice(0, MAX_ACTIONS);
}
