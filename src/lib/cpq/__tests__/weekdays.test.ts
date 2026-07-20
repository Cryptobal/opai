import { describe, expect, it } from "vitest";
import {
  coversFullDay,
  formatWeekdaysLong,
  formatWeekdaysShort,
  HOLIDAY_DAY,
  includesHoliday,
  normalizeWeekdays,
  onlyRealWeekdays,
  sortWeekdays,
  WEEKDAY_ORDER,
} from "../weekdays";

describe("normalizeWeekdays — festivos", () => {
  it("normaliza aliases de festivo a Fer", () => {
    for (const alias of ["Fer", "F", "feriado", "feriados", "festivo", "festivos", "f"]) {
      expect(normalizeWeekdays(["Lun", alias])).toEqual(["Lun", HOLIDAY_DAY]);
    }
  });

  it("dedup y deja Fer al final", () => {
    expect(normalizeWeekdays(["Fer", "Vie", "Lun", "F", "Vie"])).toEqual([
      "Vie",
      "Lun",
      HOLIDAY_DAY,
    ]);
  });
});

describe("sortWeekdays", () => {
  it("ordena días reales y Fer al final", () => {
    expect(sortWeekdays(["Fer", "Vie", "Lun", "Dom"])).toEqual([
      "Lun",
      "Vie",
      "Dom",
      HOLIDAY_DAY,
    ]);
  });
});

describe("formatWeekdaysShort / Long con festivos", () => {
  it('formatWeekdaysShort Lun-Vie +F', () => {
    expect(
      formatWeekdaysShort(["Lun", "Mar", "Mié", "Jue", "Vie", "Fer"]),
    ).toBe("Lun-Vie +F");
  });

  it('formatWeekdaysShort Lun-Dom +F', () => {
    expect(formatWeekdaysShort([...WEEKDAY_ORDER, "Fer"])).toBe("Lun-Dom +F");
  });

  it("formatWeekdaysLong sufija y festivos", () => {
    expect(
      formatWeekdaysLong(["Lun", "Mar", "Mié", "Jue", "Vie", "Fer"]),
    ).toBe("de lunes a viernes y festivos");
    expect(formatWeekdaysLong([...WEEKDAY_ORDER, "Fer"])).toBe(
      "todos los días y festivos",
    );
  });
});

describe("onlyRealWeekdays / includesHoliday / coversFullDay", () => {
  it("onlyRealWeekdays filtra Fer", () => {
    expect(onlyRealWeekdays(["Lun", "Fer", "Vie"])).toEqual(["Lun", "Vie"]);
  });

  it("includesHoliday detecta aliases", () => {
    expect(includesHoliday(["Lun", "F"])).toBe(true);
    expect(includesHoliday(["Lun", "Vie"])).toBe(false);
  });

  it("coversFullDay ignora Fer al contar 7 días", () => {
    expect(
      coversFullDay([
        {
          startTime: "08:00",
          endTime: "08:00",
          weekdays: [...WEEKDAY_ORDER, "Fer"],
        },
      ]),
    ).toBe(true);
    expect(
      coversFullDay([
        {
          startTime: "08:00",
          endTime: "20:00",
          weekdays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Fer"],
        },
      ]),
    ).toBe(false);
  });
});
