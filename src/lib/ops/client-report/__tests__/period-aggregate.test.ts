import { describe, expect, it } from "vitest";
import { aggregateAttendance, aggregateRondas, buildDigestKpis } from "../aggregate";
import {
  chileWallClock,
  periodForFrequency,
  previousClosedMonth,
  previousClosedWeek,
  shouldSendNow,
  startOfWeekChile,
} from "../period";
import { ymdInChile } from "@/lib/dates-cl";

describe("client-report aggregate", () => {
  it("computes asistencia vs cobertura from attendance statuses", () => {
    const att = aggregateAttendance([
      { attendanceStatus: "asistio" },
      { attendanceStatus: "asistio" },
      { attendanceStatus: "reemplazo" },
      { attendanceStatus: "no_asistio" },
      { attendanceStatus: "ppc" },
    ]);
    expect(att.covered).toBe(3);
    expect(att.absent).toBe(1);
    expect(att.uncovered).toBe(1);
    expect(att.asistenciaPct).toBe(75);
    expect(att.coberturaPct).toBe(60);
  });

  it("treats presente as covered (legacy portal status)", () => {
    const att = aggregateAttendance([{ attendanceStatus: "presente" }]);
    expect(att.covered).toBe(1);
    expect(att.coberturaPct).toBe(100);
  });

  it("computes rondas completed pct", () => {
    const r = aggregateRondas(["completada", "completada", "pendiente", "no_realizada"]);
    expect(r.completed).toBe(2);
    expect(r.total).toBe(4);
    expect(r.pct).toBe(50);
  });

  it("builds digest KPIs", () => {
    const k = buildDigestKpis({
      slots: [{ attendanceStatus: "asistio" }, { attendanceStatus: "ppc" }],
      rondaStatuses: ["completada"],
      incidentesTotal: 3,
      incidentesResueltos: 1,
      visitasCount: 2,
    });
    expect(k.coberturaPct).toBe(50);
    expect(k.rondasPct).toBe(100);
    expect(k.incidentesAbiertos).toBe(2);
    expect(k.visitasCount).toBe(2);
  });
});

describe("client-report period Chile", () => {
  it("previousClosedWeek is Mon–Sun ending the Monday of `now`", () => {
    // Tuesday 18 Aug 2026 15:00 UTC → Chile winter UTC-4 = 11:00 Tuesday
    const now = new Date("2026-08-18T15:00:00.000Z");
    const p = previousClosedWeek(now);
    expect(ymdInChile(p.from)).toBe("2026-08-10");
    expect(ymdInChile(p.to)).toBe("2026-08-17");
    expect(p.key).toMatch(/W33/);
  });

  it("previousClosedMonth is the previous calendar month", () => {
    const now = new Date("2026-08-18T15:00:00.000Z");
    const p = previousClosedMonth(now);
    expect(p.key).toBe("2026-07");
    expect(ymdInChile(p.from)).toBe("2026-07-01");
    expect(ymdInChile(p.to)).toBe("2026-08-01");
  });

  it("startOfWeekChile is Monday", () => {
    const now = new Date("2026-08-19T15:00:00.000Z"); // Wednesday
    const monday = startOfWeekChile(now);
    expect(ymdInChile(monday)).toBe("2026-08-17");
  });

  it("shouldSendNow fires weekly on matching Chile weekday and hour", () => {
    // Monday 24 Aug 2026 12:00 UTC = 08:00 Chile (UTC-4)
    const now = new Date("2026-08-24T12:00:00.000Z");
    const clock = chileWallClock(now);
    expect(clock.weekdayMon0).toBe(0);
    expect(clock.hour).toBe(8);

    const period = periodForFrequency("weekly", now);
    const yes = shouldSendNow(
      {
        enabled: true,
        frequency: "weekly",
        weekday: 0,
        dayOfMonth: 1,
        sendHourChile: 8,
        lastPeriodKey: null,
      },
      now
    );
    expect(yes.send).toBe(true);
    expect(yes.period.key).toBe(period.key);

    const already = shouldSendNow(
      {
        enabled: true,
        frequency: "weekly",
        weekday: 0,
        dayOfMonth: 1,
        sendHourChile: 8,
        lastPeriodKey: period.key,
      },
      now
    );
    expect(already.send).toBe(false);

    const wrongDay = shouldSendNow(
      {
        enabled: true,
        frequency: "weekly",
        weekday: 2,
        dayOfMonth: 1,
        sendHourChile: 8,
        lastPeriodKey: null,
      },
      now
    );
    expect(wrongDay.send).toBe(false);
  });

  it("shouldSendNow monthly uses day of month in Chile", () => {
    const now = new Date("2026-08-01T12:00:00.000Z"); // 08:00 Chile 1 Aug
    const yes = shouldSendNow(
      {
        enabled: true,
        frequency: "monthly",
        weekday: 0,
        dayOfMonth: 1,
        sendHourChile: 8,
        lastPeriodKey: null,
      },
      now
    );
    expect(yes.send).toBe(true);
    expect(yes.period.key).toBe("2026-07");
  });
});
