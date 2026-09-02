import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  computeTenantMonthly,
  isPricingComplete,
  serializeTenantMonthly,
} from "@/lib/platform/pricing";
import { monthlyDisplay, tallyStatusCounts, tenantStatusUi } from "@/lib/platform/status-ui";
import { tenantSearchWhere } from "@/lib/platform/tenant-search";
import { buildDashboardActions } from "@/lib/platform/dashboard-actions";
import { validateIncludedModules, addonsAbsorbedByPlan } from "@/lib/platform/catalog-validate";
import { auditFamily } from "@/lib/platform/audit-family";
import { buildAuditWhere, matchesAuditFamilyFilter } from "@/lib/platform/audit-query";
import { deriveTenantAccess, type TenantAccessSnapshot } from "@/lib/platform/tenant-lifecycle";
import type { LifecycleSettings } from "@/lib/platform/settings";

const SETTINGS: LifecycleSettings = {
  enabled: true,
  emailsEnabled: false,
  exemptSlugs: ["gard"],
  trialDefaultDays: 30,
  trialGraceDays: 7,
  trialReminderDays: [7, 3, 1, 0],
  pastDueGraceDays: 15,
  suspendedMarcacionGraceDays: 30,
  signupDefaultPlan: "profesional",
};

function accessOf(over: Partial<TenantAccessSnapshot["plan"]> & { slug?: string; active?: boolean }): ReturnType<typeof deriveTenantAccess> {
  const snap: TenantAccessSnapshot = {
    tenantId: "t1",
    slug: over.slug ?? "acme",
    active: over.active ?? true,
    suspendedAt: null,
    plan: {
      billingStatus: "active",
      trialEndsAt: null,
      graceEndsAt: null,
      statusChangedAt: new Date("2026-01-01"),
      ...over,
    },
  };
  return deriveTenantAccess(snap, new Date("2026-06-15T15:00:00.000Z"), SETTINGS);
}

describe("pricing preview (3 casos)", () => {
  it("starter catálogo con N guardias", () => {
    const price = computeTenantMonthly(
      { plan: "starter", pricePerGuard: 1.2, basePrice: 10, billingStatus: "active" },
      [],
      [],
      20,
    );
    const ser = serializeTenantMonthly(price, 38000);
    expect(ser.complete).toBe(true);
    expect(ser.total).toBe(24);
    expect(ser.clpTotal).toBe(24 * 38000);
    expect(ser.countsTowardMrr).toBe(true);
  });

  it("enterprise incompleto", () => {
    const plan = { plan: "enterprise", pricePerGuard: 0, basePrice: 0, billingStatus: "active" };
    expect(isPricingComplete(plan)).toBe(false);
    const ser = serializeTenantMonthly(computeTenantMonthly(plan, [], [], 10), null);
    expect(ser.complete).toBe(false);
    expect(ser.countsTowardMrr).toBe(false);
  });

  it("negociado + add-on per_guard", () => {
    const price = computeTenantMonthly(
      {
        plan: "profesional",
        pricePerGuard: 2,
        basePrice: 15,
        customPricePerGuard: new Prisma.Decimal("1.5"),
        customBaseMinimum: new Prisma.Decimal("20"),
        billingStatus: "active",
      },
      [{ slug: "rondas", name: "Rondas", pricingModel: "per_guard", priceAmount: 0.4, customPrice: null }],
      [],
      10,
    );
    const ser = serializeTenantMonthly(price, null);
    expect(ser.complete).toBe(true);
    expect(ser.planPrice).toBe(20);
    expect(ser.addonsTotal).toBe(4);
    expect(ser.total).toBe(24);
  });
});

describe("tenants search y counts", () => {
  it("normaliza RUT con y sin puntos", () => {
    const where = tenantSearchWhere("12.345.678-5");
    expect(where.OR).toBeDefined();
    const needles = (where.OR as { companyRut?: { contains: string } }[])
      .map((c) => c.companyRut?.contains)
      .filter(Boolean);
    expect(needles.some((n) => n?.includes("12345678"))).toBe(true);
  });

  it("cuenta estados derivados", () => {
    const counts = tallyStatusCounts([
      { lifecycleState: "active", exempt: false },
      { lifecycleState: "trialing", exempt: false },
      { lifecycleState: "trial_expired", exempt: false },
      { lifecycleState: "suspended", exempt: false },
      { lifecycleState: "active", exempt: true },
    ]);
    expect(counts.all).toBe(5);
    expect(counts.paying).toBe(1);
    expect(counts.trial).toBe(1);
    expect(counts.grace).toBe(1);
    expect(counts.suspended).toBe(1);
  });

  it("mensual trial muestra — y pendiente warn", () => {
    const trial = monthlyDisplay(accessOf({ billingStatus: "trialing" }), {
      planPrice: 10, addonsTotal: 0, packDiscount: 0, total: 10, currency: "UF",
      complete: true, countsTowardMrr: false, clpTotal: null,
      breakdown: { pricePerGuard: 1, baseMinimum: 10, guards: 1, addonLines: [] },
    });
    expect(trial.kind).toBe("trial");
    expect(trial.text).toBe("—");

    const pending = monthlyDisplay(accessOf({ billingStatus: "active" }), {
      planPrice: 0, addonsTotal: 0, packDiscount: 0, total: 0, currency: "UF",
      complete: false, countsTowardMrr: false, clpTotal: null,
      breakdown: { pricePerGuard: 0, baseMinimum: 0, guards: 1, addonLines: [] },
    });
    expect(pending.kind).toBe("pending");
  });
});

describe("audit filtros", () => {
  it("mapea familia por prefijo", () => {
    expect(auditFamily("lifecycle.activate")).toBe("lifecycle");
    expect(auditFamily("plan.change")).toBe("plan");
    expect(auditFamily("commercial.update")).toBe("price");
    expect(auditFamily("modules.toggle")).toBe("modules");
    expect(auditFamily("billing.export")).toBe("billing");
  });

  it("where de búsqueda y actor system", () => {
    const where = buildAuditWhere({ q: "plan", actor: "system", tenantId: "t1" });
    expect(where.actorType).toBe("system");
    expect(where.tenantId).toBe("t1");
    expect(where.AND).toBeDefined();
  });

  it("filtra impersonación en memoria", () => {
    expect(matchesAuditFamilyFilter("impersonate.start", "impersonation")).toBe(true);
    expect(matchesAuditFamilyFilter("plan.change", "impersonation")).toBe(false);
  });
});

describe("catálogo y add-ons absorbidos", () => {
  it("rechaza módulo desconocido y beta en starter", () => {
    const unknown = validateIncludedModules("starter", ["nope"]);
    expect(unknown.ok).toBe(false);
    const beta = validateIncludedModules("starter", ["hub", "ops_camaras"]);
    expect(beta.ok).toBe(false);
  });

  it("enterprise fuerza todos los módulos", () => {
    const r = validateIncludedModules("enterprise", ["hub"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.keys.length).toBeGreaterThan(1);
  });

  it("desactiva add-on cuyo módulo pasó al plan", () => {
    const slugs = addonsAbsorbedByPlan(
      [
        { slug: "crm-plus", moduleKey: "crm" },
        { slug: "rondas", moduleKey: "ops_rondas" },
      ],
      ["crm"],
    );
    expect(slugs).toEqual(["crm-plus"]);
  });
});

describe("dashboard actions", () => {
  it("prioriza upgrade y tope 5", () => {
    const now = new Date("2026-06-15T12:00:00.000Z");
    const actions = buildDashboardActions({
      now,
      upgradeRequests: [
        { id: "u1", tenantId: "t1", tenantName: "Acme", requestedPlan: "enterprise" },
      ],
      tenants: [
        {
          id: "t2",
          name: "Beta",
          lifecycleState: "active",
          daysLeft: null,
          activeGuards: 10,
          lastLoginAt: now,
          createdAt: now,
          pricingComplete: false,
          exempt: false,
        },
      ],
    });
    expect(actions[0]?.kind).toBe("upgrade_request");
    expect(actions.some((a) => a.kind === "pricing_incomplete")).toBe(true);
    expect(actions.length).toBeLessThanOrEqual(5);
  });
});

describe("status ui", () => {
  it("exento y sin plan", () => {
    expect(tenantStatusUi(accessOf({ slug: "gard" })).statusLabel).toBe("Exento");
    const missing = deriveTenantAccess(
      { tenantId: "x", slug: "z", active: true, suspendedAt: null, plan: null },
      new Date(),
      SETTINGS,
    );
    expect(tenantStatusUi(missing).statusLabel).toBe("Sin plan");
  });
});
