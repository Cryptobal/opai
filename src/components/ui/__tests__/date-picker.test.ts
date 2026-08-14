import { describe, expect, it } from "vitest";
import { localDateToYmd, ymdToLocalDate } from "@/components/ui/date-picker";

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
