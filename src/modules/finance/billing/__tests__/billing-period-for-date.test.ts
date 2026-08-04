import { describe, it, expect } from "vitest";
import {
  resolveBillingPeriodForDate,
  billingPeriodFromAnchor,
  type BillingPeriodTemplate,
} from "../dte-recurring-schedule";

function monthlyTpl(over: Partial<BillingPeriodTemplate> = {}): BillingPeriodTemplate {
  return {
    frequency: "monthly",
    dayOfMonth: 5,
    dayOfWeek: null,
    monthOfYear: null,
    startDate: new Date("2026-01-05T00:00:00.000Z"),
    endDate: null,
    lastRunAt: null,
    facturaTiming: "AL_EMITIR",
    facturaDay: null,
    facturaMesRelativo: "MISMO_MES",
    ...over,
  };
}

describe("resolveBillingPeriodForDate", () => {
  it("AL_EMITIR: período = mes de la cuota cuya emisión calza", () => {
    const tpl = monthlyTpl();
    expect(resolveBillingPeriodForDate(tpl, "2026-08-05")).toBe("2026-08");
    expect(resolveBillingPeriodForDate(tpl, "2026-03-05")).toBe("2026-03");
  });

  it("DIA_ESPECIFICO + MES_SIGUIENTE: emisión en mes siguiente, período = mes de servicio", () => {
    const tpl = monthlyTpl({
      dayOfMonth: 1,
      facturaTiming: "DIA_ESPECIFICO",
      facturaDay: 5,
      facturaMesRelativo: "MES_SIGUIENTE",
    });
    // Cuota de agosto (anchor 2026-08-01) → emite 2026-09-05 → período 2026-08
    expect(resolveBillingPeriodForDate(tpl, "2026-09-05")).toBe("2026-08");
  });

  it("fecha sin calce exacto → período de la ocurrencia más cercana", () => {
    const tpl = monthlyTpl();
    expect(resolveBillingPeriodForDate(tpl, "2026-08-07")).toBe("2026-08");
  });
});

describe("billingPeriodFromAnchor", () => {
  it("formatea YYYY-MM UTC", () => {
    expect(billingPeriodFromAnchor(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08");
  });
});
