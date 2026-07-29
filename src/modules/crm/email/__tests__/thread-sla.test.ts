import { describe, expect, it } from "vitest";
import { fromZonedTime } from "date-fns-tz";
import { CHILE_TZ } from "@/lib/dates-cl";
import {
  businessHoursBetween,
  formatSlaLabel,
  resolveThreadSla,
  DEFAULT_SLA_THRESHOLDS,
} from "../thread-sla";

/** Instante UTC correspondiente a Y-M-D H:M en Chile. */
function chile(y: number, m: number, d: number, h: number, min = 0): Date {
  return fromZonedTime(new Date(y, m - 1, d, h, min, 0, 0), CHILE_TZ);
}

describe("businessHoursBetween", () => {
  it("cuenta horas dentro del mismo día hábil", () => {
    // Mié 2026-07-01 10:00 → 14:00 Chile = 4 h
    const from = chile(2026, 7, 1, 10);
    const to = chile(2026, 7, 1, 14);
    expect(businessHoursBetween(from, to)).toBeCloseTo(4, 5);
  });

  it("cruza la noche: solo horario hábil", () => {
    // Mar 17:00 → Mié 10:00 = 1 h (mar) + 1 h (mié) = 2 h
    const from = chile(2026, 6, 30, 17); // mar
    const to = chile(2026, 7, 1, 10); // mié
    expect(businessHoursBetween(from, to)).toBeCloseTo(2, 5);
  });

  it("ignora el fin de semana", () => {
    // Vie 16:00 → Lun 11:00 = 2 h (vie) + 2 h (lun) = 4 h
    const from = chile(2026, 7, 3, 16); // vie
    const to = chile(2026, 7, 6, 11); // lun
    expect(businessHoursBetween(from, to)).toBeCloseTo(4, 5);
  });

  it("devuelve 0 si to <= from", () => {
    const t = chile(2026, 7, 1, 12);
    expect(businessHoursBetween(t, t)).toBe(0);
    expect(businessHoursBetween(t, chile(2026, 7, 1, 11))).toBe(0);
  });

  it("fuera de horario hábil no acumula hasta el inicio del día", () => {
    // Lun 07:00 → Lun 10:00 = solo 1 h (09–10)
    const from = chile(2026, 7, 6, 7);
    const to = chile(2026, 7, 6, 10);
    expect(businessHoursBetween(from, to)).toBeCloseTo(1, 5);
  });
});

describe("formatSlaLabel", () => {
  it("usa horas bajo 24 h", () => {
    expect(formatSlaLabel(3.2)).toBe("3 h");
    expect(formatSlaLabel(0.4)).toBe("1 h");
  });

  it("usa días hábiles ( / 9 ) desde 24 h", () => {
    expect(formatSlaLabel(27)).toBe("3 d"); // round(27/9)=3
    expect(formatSlaLabel(24)).toBe("3 d"); // round(24/9)=3
  });
});

describe("resolveThreadSla", () => {
  const base = {
    lastInboundAt: chile(2026, 7, 1, 9), // mié 09:00
    lastOutboundAt: null as Date | null,
    accountId: "acc-1",
    dealId: "deal-1",
    dealIsOpen: true,
  };

  it("sin entrante → sin SLA", () => {
    const r = resolveThreadSla(
      { ...base, lastInboundAt: null },
      { now: chile(2026, 7, 1, 18) },
    );
    expect(r.level).toBeNull();
    expect(r.label).toBeNull();
  });

  it("outbound posterior al inbound → sin SLA", () => {
    const r = resolveThreadSla(
      {
        ...base,
        lastInboundAt: chile(2026, 7, 1, 9),
        lastOutboundAt: chile(2026, 7, 1, 11),
      },
      { now: chile(2026, 7, 1, 18) },
    );
    expect(r.level).toBeNull();
  });

  it("inbound posterior al outbound → cuenta espera", () => {
    // inbound a las 10, outbound previo a las 09; now = 18 → 8 h → warn (deal)
    const r = resolveThreadSla(
      {
        ...base,
        lastInboundAt: chile(2026, 7, 1, 10),
        lastOutboundAt: chile(2026, 7, 1, 9),
      },
      { now: chile(2026, 7, 1, 18), thresholds: DEFAULT_SLA_THRESHOLDS },
    );
    expect(r.businessHours).toBeCloseTo(8, 5);
    expect(r.level).toBe("warn");
    expect(r.label).toBe("8 h");
  });

  it("alias propio no genera SLA", () => {
    const r = resolveThreadSla(
      { ...base, lastInboundIsOwn: true },
      { now: chile(2026, 7, 2, 18) },
    );
    expect(r.level).toBeNull();
  });

  it("archivado / papelera / spam / snooze suprimen SLA", () => {
    const now = chile(2026, 7, 2, 18);
    expect(resolveThreadSla({ ...base, archivedAt: now }, { now }).level).toBeNull();
    expect(resolveThreadSla({ ...base, trashedAt: now }, { now }).level).toBeNull();
    expect(resolveThreadSla({ ...base, spamAt: now }, { now }).level).toBeNull();
    expect(
      resolveThreadSla({ ...base, snoozedUntil: chile(2026, 7, 3, 12) }, { now }).level,
    ).toBeNull();
  });

  it("sin cuenta → no aplica", () => {
    const r = resolveThreadSla(
      { ...base, accountId: null },
      { now: chile(2026, 7, 3, 18) },
    );
    expect(r.level).toBeNull();
  });

  it("sin negocio usa umbrales nodeal (warn ≥ 24)", () => {
    // 3 días hábiles × 9 h = 27 h → warn nodeal
    const r = resolveThreadSla(
      {
        ...base,
        dealId: null,
        lastInboundAt: chile(2026, 7, 1, 9), // mié
      },
      { now: chile(2026, 7, 3, 18) }, // vie 18 → mié+jue+vie = 27 h
    );
    expect(r.businessHours).toBeCloseTo(27, 5);
    expect(r.level).toBe("warn");
  });

  it("negocio cerrado no usa umbrales de deal", () => {
    const r = resolveThreadSla(
      {
        ...base,
        dealIsOpen: false,
        lastInboundAt: chile(2026, 7, 1, 9),
      },
      { now: chile(2026, 7, 1, 18) }, // 9 h — bajo nodeal warn(24)
    );
    expect(r.level).toBeNull();
  });

  it("remitente automático no genera SLA", () => {
    const r = resolveThreadSla(
      { ...base, lastInboundIsSystem: true },
      { now: chile(2026, 7, 3, 18) },
    );
    expect(r.level).toBeNull();
  });
});
