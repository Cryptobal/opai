// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addDaysChile } from "@/lib/dates-cl";
import {
  computeBillingMigration,
  isEnterpriseIncomplete,
  shouldDeactivateAddon,
  type MigrationTenantInput,
} from "@/lib/platform/lifecycle-migration";

const NOW = new Date("2026-09-02T15:00:00.000Z");
const GRACE = 7;

function tenant(over: Partial<MigrationTenantInput> = {}, planOver: Partial<NonNullable<MigrationTenantInput["plan"]>> | null = {}): MigrationTenantInput {
  return {
    id: "t1",
    slug: "acme",
    active: true,
    suspendedAt: null,
    suspendedReason: null,
    plan:
      planOver === null
        ? null
        : {
            id: "p1",
            plan: "profesional",
            billingStatus: "trial",
            trialEndsAt: addDaysChile(NOW, 10),
            graceEndsAt: null,
            statusChangedAt: null,
            statusReason: null,
            customBaseMinimum: null,
            ...planOver,
          },
    ...over,
  };
}

describe("computeBillingMigration", () => {
  it("normaliza trial → trialing si aún no vence", () => {
    const intent = computeBillingMigration(tenant(), NOW, GRACE);
    expect(intent.kind).toBe("update");
    expect(intent.billingStatus).toBe("trialing");
    expect(intent.notes.some((n) => n.startsWith("alias:"))).toBe(true);
  });

  it("trial vencido pasa a trial_expired con gracia, nunca suspended", () => {
    const intent = computeBillingMigration(
      tenant({}, { billingStatus: "trial", trialEndsAt: addDaysChile(NOW, -5) }),
      NOW,
      GRACE,
    );
    expect(intent.billingStatus).toBe("trial_expired");
    expect(intent.graceEndsAt).toEqual(addDaysChile(NOW, GRACE));
    expect(intent.notes.some((n) => n.includes("sin suspender"))).toBe(true);
  });

  it("kill switch deja suspended con motivo existente", () => {
    const intent = computeBillingMigration(
      tenant(
        { active: false, suspendedReason: "impago" },
        { billingStatus: "active" },
      ),
      NOW,
      GRACE,
    );
    expect(intent.billingStatus).toBe("suspended");
    expect(intent.statusReason).toBe("impago");
  });

  it("cancelled + kill switch se conserva cancelled", () => {
    const intent = computeBillingMigration(
      tenant({ active: false }, { billingStatus: "cancelled" }),
      NOW,
      GRACE,
    );
    expect(intent.billingStatus).toBe("cancelled");
  });

  it("sin plan crea free y no bloquea", () => {
    const intent = computeBillingMigration(tenant({}, null), NOW, GRACE);
    expect(intent.kind).toBe("create_plan");
    expect(intent.createPlanSlug).toBe("free");
    expect(intent.billingStatus).toBe("active");
  });

  it("active ya normalizado es noop", () => {
    const intent = computeBillingMigration(
      tenant({}, { billingStatus: "active", trialEndsAt: null }),
      NOW,
      GRACE,
    );
    expect(intent.kind).toBe("noop");
    expect(intent.billingStatus).toBe("active");
  });
});

describe("catálogo", () => {
  it("desactiva add-on incluido en Profesional", () => {
    expect(shouldDeactivateAddon("chat", new Set(["chat", "ops_supervision"]))).toBe(true);
  });

  it("mantiene add-on opcional sobre Profesional", () => {
    expect(shouldDeactivateAddon("crm", new Set(["chat"]))).toBe(false);
    expect(shouldDeactivateAddon("ops_camaras", new Set())).toBe(false);
  });

  it("desactiva add-on sin moduleKey o fuera de la lista opcional", () => {
    expect(shouldDeactivateAddon(null, new Set())).toBe(true);
    expect(shouldDeactivateAddon("hub", new Set())).toBe(true);
  });

  it("enterprise incompleto solo con slug enterprise", () => {
    expect(isEnterpriseIncomplete("enterprise", null)).toBe(true);
    expect(isEnterpriseIncomplete("enterprise", 12)).toBe(false);
    expect(isEnterpriseIncomplete("profesional", null)).toBe(false);
  });
});
