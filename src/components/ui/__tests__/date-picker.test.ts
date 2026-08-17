import { describe, expect, it } from "vitest";
import { localDateToYmd, ymdToLocalDate } from "@/components/ui/date-picker";
import { defaultEndMonth, defaultStartMonth } from "@/components/ui/calendar";

describe("DatePickerField YMD helpers", () => {
  it("parsea YYYY-MM-DD sin shift UTC", () => {
    const d = ymdToLocalDate("2026-08-14");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(7);
    expect(d!.getDate()).toBe(14);
  });

  it("rechaza valores inválidos", () => {
    expect(ymdToLocalDate("14-08-2026")).toBeUndefined();
    expect(ymdToLocalDate("")).toBeUndefined();
  });

  it("serializa Date local a YYYY-MM-DD", () => {
    expect(localDateToYmd(new Date(2026, 7, 14))).toBe("2026-08-14");
  });
});

describe("Calendar month/year dropdown range", () => {
  it("cubre ~100 años hacia atrás (cumpleaños)", () => {
    const start = defaultStartMonth();
    const now = new Date();
    expect(start.getFullYear()).toBe(now.getFullYear() - 100);
    expect(start.getMonth()).toBe(0);
  });

  it("cubre ~30 años hacia adelante (contratos / vigencia CPQ)", () => {
    const end = defaultEndMonth();
    const now = new Date();
    expect(end.getFullYear()).toBe(now.getFullYear() + 30);
    expect(end.getMonth()).toBe(11);
  });
});
