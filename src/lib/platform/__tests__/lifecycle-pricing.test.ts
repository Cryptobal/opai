// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { addDaysChile } from "@/lib/dates-cl";
import {
  computeTenantMonthly,
  isPricingComplete,
  serializeTenantMonthly,
} from "@/lib/platform/pricing";
import {
  actionToStatus,
  deriveTenantAccess,
  isTransitionAllowed,
  normalizeBillingStatus,
  uiCompatStatus,
  type TenantAccessSnapshot,
} from "@/lib/platform/tenant-lifecycle";
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

const NOW = new Date("2026-06-15T15:00:00.000Z");

function snapshot(over: Partial<TenantAccessSnapshot> & { planOver?: Partial<NonNullable<TenantAccessSnapshot["plan"]>> } = {}): TenantAccessSnapshot {
  const { planOver, ...rest } = over;
  return {
    tenantId: "t1",
    slug: "acme",
    active: true,
    suspendedAt: null,
    plan: {
      billingStatus: "trialing",
      trialEndsAt: addDaysChile(NOW, 10),
      graceEndsAt: null,
      statusChangedAt: NOW,
      ...planOver,
    },
    ...rest,
  };
}

describe("normalizeBillingStatus", () => {
  it("mapea trial legacy a trialing", () => {
    expect(normalizeBillingStatus("trial")).toBe("trialing");
    expect(normalizeBillingStatus("active")).toBe("active");
    expect(normalizeBillingStatus("nope")).toBeNull();
  });
});

describe("isTransitionAllowed", () => {
  const allowed: Array<[string, string]> = [
    ["trialing", "trial_expired"],
    ["trialing", "active"],
    ["trialing", "suspended"],
    ["trialing", "cancelled"],
    ["trial_expired", "trialing"],
    ["trial_expired", "active"],
    ["trial_expired", "suspended"],
    ["trial_expired", "cancelled"],
    ["active", "past_due"],
    ["active", "suspended"],
    ["active", "cancelled"],
    ["past_due", "active"],
    ["past_due", "suspended"],
    ["past_due", "cancelled"],
    ["suspended", "active"],
    ["cancelled", "active"],
  ];

  it.each(allowed)("%s → %s permitido", (from, to) => {
    expect(isTransitionAllowed(from as never, to as never)).toBe(true);
  });

  it("rechaza transiciones inválidas", () => {
    expect(isTransitionAllowed("trialing", "past_due")).toBe(false);
    expect(isTransitionAllowed("active", "trialing")).toBe(false);
    expect(isTransitionAllowed("suspended", "cancelled")).toBe(false);
    expect(isTransitionAllowed("active", "active")).toBe(false);
  });

  it("mapea acciones de plataforma", () => {
    expect(actionToStatus("activate")).toBe("active");
    expect(actionToStatus("extend_trial")).toBe("trialing");
    expect(actionToStatus("mark_past_due")).toBe("past_due");
    expect(actionToStatus("nope")).toBeNull();
  });
});

describe("deriveTenantAccess", () => {
  it("trialing vigente es full sin banner si faltan más de 7 días", () => {
    const access = deriveTenantAccess(snapshot(), NOW, SETTINGS);
    expect(access.state).toBe("trialing");
    expect(access.mode).toBe("full");
    expect(access.bannerKey).toBeUndefined();
    expect(access.marcacionAllowed).toBe(true);
  });

  it("trialing a 7 días muestra banner trial_expiring", () => {
    const access = deriveTenantAccess(
      snapshot({ planOver: { trialEndsAt: addDaysChile(NOW, 7) } }),
      NOW,
      SETTINGS,
    );
    expect(access.mode).toBe("full");
    expect(access.bannerKey).toBe("trial_expiring");
    expect(access.daysLeft).toBe(7);
  });

  it("trialing con trialEndsAt vencido deriva trial_expired / read_only", () => {
    const access = deriveTenantAccess(
      snapshot({
        planOver: {
          billingStatus: "trialing",
          trialEndsAt: addDaysChile(NOW, -1),
          graceEndsAt: addDaysChile(NOW, 6),
        },
      }),
      NOW,
      SETTINGS,
    );
    expect(access.state).toBe("trial_expired");
    expect(access.mode).toBe("read_only");
    expect(access.bannerKey).toBe("trial_expired");
    expect(access.marcacionAllowed).toBe(true);
  });

  it("trial_expired con gracia vencida deriva suspended / blocked", () => {
    const access = deriveTenantAccess(
      snapshot({
        planOver: {
          billingStatus: "trial_expired",
          trialEndsAt: addDaysChile(NOW, -10),
          graceEndsAt: addDaysChile(NOW, -1),
          statusChangedAt: addDaysChile(NOW, -8),
        },
      }),
      NOW,
      SETTINGS,
    );
    expect(access.state).toBe("suspended");
    expect(access.mode).toBe("blocked");
  });

  it("active es full", () => {
    const access = deriveTenantAccess(
      snapshot({ planOver: { billingStatus: "active", trialEndsAt: null } }),
      NOW,
      SETTINGS,
    );
    expect(access.state).toBe("active");
    expect(access.mode).toBe("full");
    expect(access.bannerKey).toBeUndefined();
  });

  it("past_due vigente es full con banner", () => {
    const access = deriveTenantAccess(
      snapshot({
        planOver: {
          billingStatus: "past_due",
          graceEndsAt: addDaysChile(NOW, 5),
        },
      }),
      NOW,
      SETTINGS,
    );
    expect(access.mode).toBe("full");
    expect(access.bannerKey).toBe("past_due");
  });

  it("past_due con gracia vencida deriva suspended", () => {
    const access = deriveTenantAccess(
      snapshot({
        planOver: {
          billingStatus: "past_due",
          graceEndsAt: addDaysChile(NOW, -1),
          statusChangedAt: addDaysChile(NOW, -16),
        },
      }),
      NOW,
      SETTINGS,
    );
    expect(access.state).toBe("suspended");
    expect(access.mode).toBe("blocked");
  });

  it("cancelled bloquea marcación", () => {
    const access = deriveTenantAccess(
      snapshot({ planOver: { billingStatus: "cancelled" } }),
      NOW,
      SETTINGS,
    );
    expect(access.mode).toBe("blocked");
    expect(access.marcacionAllowed).toBe(false);
  });

  it("kill switch Tenant.active=false bloquea aunque el plan diga active", () => {
    const access = deriveTenantAccess(
      snapshot({
        active: false,
        suspendedAt: addDaysChile(NOW, -2),
        planOver: { billingStatus: "active" },
      }),
      NOW,
      SETTINGS,
    );
    expect(access.state).toBe("suspended");
    expect(access.mode).toBe("blocked");
    expect(access.marcacionAllowed).toBe(true);
  });

  it("exento gard permanece full aunque el trial haya vencido", () => {
    const access = deriveTenantAccess(
      snapshot({
        slug: "gard",
        planOver: {
          billingStatus: "trialing",
          trialEndsAt: addDaysChile(NOW, -40),
        },
      }),
      NOW,
      SETTINGS,
    );
    expect(access.exempt).toBe(true);
    expect(access.mode).toBe("full");
    expect(access.state).toBe("trialing");
  });

  it("sin plan trata como active exento de fechas", () => {
    const access = deriveTenantAccess(
      snapshot({ plan: null }),
      NOW,
      SETTINGS,
    );
    expect(access.missingPlan).toBe(true);
    expect(access.mode).toBe("full");
    expect(access.state).toBe("active");
  });

  it("lifecycle.enabled=false devuelve full (respeta kill switch)", () => {
    const disabled = { ...SETTINGS, enabled: false };
    const expired = deriveTenantAccess(
      snapshot({
        planOver: { billingStatus: "trialing", trialEndsAt: addDaysChile(NOW, -1) },
      }),
      NOW,
      disabled,
    );
    expect(expired.mode).toBe("full");

    const killed = deriveTenantAccess(
      snapshot({ active: false, suspendedAt: NOW, planOver: { billingStatus: "active" } }),
      NOW,
      disabled,
    );
    expect(killed.mode).toBe("blocked");
  });

  it("uiCompatStatus mapea a trial/active/suspended", () => {
    expect(uiCompatStatus(deriveTenantAccess(snapshot(), NOW, SETTINGS))).toBe("trial");
    expect(
      uiCompatStatus(
        deriveTenantAccess(
          snapshot({ planOver: { billingStatus: "active" } }),
          NOW,
          SETTINGS,
        ),
      ),
    ).toBe("active");
  });
});

describe("computeTenantMonthly", () => {
  it("usa precio custom y mínimo negociado", () => {
    const price = computeTenantMonthly(
      {
        plan: "profesional",
        pricePerGuard: 0.8,
        basePrice: 45,
        customPricePerGuard: 0.4,
        customBaseMinimum: 20,
        currency: "UF",
        billingStatus: "active",
      },
      [],
      [],
      10,
    );
    expect(price.complete).toBe(true);
    expect(price.countsTowardMrr).toBe(true);
    expect(Number(price.planPrice.toString())).toBe(20);
  });

  it("enterprise sin customBaseMinimum queda incompleto", () => {
    expect(
      isPricingComplete({
        plan: "enterprise",
        pricePerGuard: 0,
        basePrice: 0,
        customBaseMinimum: null,
      }),
    ).toBe(false);
    const price = computeTenantMonthly(
      {
        plan: "enterprise",
        pricePerGuard: 0,
        basePrice: 0,
        billingStatus: "active",
      },
      [],
      [],
      603,
    );
    expect(price.complete).toBe(false);
    expect(price.countsTowardMrr).toBe(false);
  });

  it("enterprise con customBaseMinimum cuenta al MRR", () => {
    const price = computeTenantMonthly(
      {
        plan: "enterprise",
        pricePerGuard: 0,
        basePrice: 0,
        customBaseMinimum: new Prisma.Decimal("120.50"),
        billingStatus: "active",
      },
      [],
      [],
      603,
    );
    expect(price.complete).toBe(true);
    expect(price.countsTowardMrr).toBe(true);
    expect(serializeTenantMonthly(price).total).toBe(120.5);
  });

  it("cobro per_guard + flat + pack discount", () => {
    const price = computeTenantMonthly(
      {
        plan: "profesional",
        pricePerGuard: 0.8,
        basePrice: 45,
        billingStatus: "active",
      },
      [
        { slug: "crm", name: "CRM", pricingModel: "flat", priceAmount: 10 },
        { slug: "cpq", name: "CPQ", pricingModel: "per_guard", priceAmount: 0.1 },
      ],
      [{ slug: "pack-comercial", addonSlugs: ["crm", "cpq"], discountPct: 20 }],
      100,
    );
    expect(Number(price.planPrice.toString())).toBe(80);
    expect(Number(price.addonsTotal.toString())).toBe(20);
    expect(Number(price.packDiscount.toString())).toBe(4);
    expect(serializeTenantMonthly(price).total).toBe(96);
  });

  it("trial no cuenta al MRR", () => {
    const price = computeTenantMonthly(
      {
        plan: "profesional",
        pricePerGuard: 0.8,
        basePrice: 45,
        billingStatus: "trialing",
      },
      [],
      [],
      50,
    );
    expect(price.countsTowardMrr).toBe(false);
  });

  it("serializa CLP informativo con UF", () => {
    const price = computeTenantMonthly(
      {
        plan: "starter",
        pricePerGuard: 0.5,
        basePrice: 20,
        billingStatus: "active",
      },
      [],
      [],
      40,
    );
    const json = serializeTenantMonthly(price, 39_000);
    expect(json.total).toBe(20);
    expect(json.clpTotal).toBe(780_000);
    expect(json.currency).toBe("UF");
  });
});
