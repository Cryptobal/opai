import { describe, it, expect } from "vitest";
import {
  weekStartYmd,
  isMondayYmd,
  enumerateWeeks,
  defaultHorizon,
  monthKeyOf,
  monthKeyOfDate,
  weekLabel,
  ymdToDate,
} from "../weeks";

describe("flow-v3 weeks", () => {
  it("weekStartYmd devuelve el lunes ISO de la semana", () => {
    // Martes 2026-07-21 → lunes 2026-07-20
    expect(weekStartYmd(new Date(Date.UTC(2026, 6, 21)))).toBe("2026-07-20");
    // Domingo 2026-07-26 sigue en la semana del lunes 20
    expect(weekStartYmd(new Date(Date.UTC(2026, 6, 26)))).toBe("2026-07-20");
    // Lunes queda igual
    expect(weekStartYmd(new Date(Date.UTC(2026, 6, 20)))).toBe("2026-07-20");
  });

  it("isMondayYmd valida lunes exactos", () => {
    expect(isMondayYmd("2026-07-20")).toBe(true);
    expect(isMondayYmd("2026-07-21")).toBe(false);
    expect(isMondayYmd("no-fecha")).toBe(false);
  });

  it("enumerateWeeks lista lunes inclusivos", () => {
    const weeks = enumerateWeeks(
      new Date(Date.UTC(2026, 6, 21)),
      new Date(Date.UTC(2026, 7, 4)),
    );
    expect(weeks).toEqual(["2026-07-20", "2026-07-27", "2026-08-03"]);
  });

  it("defaultHorizon = lunes(hoy−4sem) → lunes(hoy+12meses)", () => {
    const today = new Date(Date.UTC(2026, 6, 21)); // mar 21-jul-2026
    const { from, to } = defaultHorizon(today);
    expect(from.toISOString().slice(0, 10)).toBe("2026-06-22");
    // 21-jul-2027 cae en la semana del lunes 19-jul-2027
    expect(to.toISOString().slice(0, 10)).toBe("2027-07-19");
  });

  it("monthKeyOf agrega la semana al mes de su lunes", () => {
    expect(monthKeyOf("2026-07-27")).toBe("2026-07");
    // Semana que cruza mes: lunes 31-ago → agosto
    expect(monthKeyOf("2026-08-31")).toBe("2026-08");
  });

  it("monthKeyOfDate usa el mes calendario de la fecha del ítem", () => {
    // Semana frontera: lunes 2027-05-31 → MAY; ítem 02/06 → JUN
    expect(monthKeyOf("2027-05-31")).toBe("2027-05");
    expect(monthKeyOfDate("2027-06-02")).toBe("2027-06");
  });

  it("weekLabel usa número de semana ISO", () => {
    const d = ymdToDate("2026-01-05");
    expect(d).not.toBeNull();
    expect(weekLabel("2026-01-05")).toBe("S02");
  });
});
