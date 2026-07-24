import { describe, expect, it } from "vitest";
import { formatGmailDateChile } from "../gmail-date-format";

const NOW = new Date("2026-07-24T16:00:00.000Z"); // 12:00 en Chile

describe("formatGmailDateChile", () => {
  it("muestra la hora local de Chile para correos de hoy", () => {
    expect(
      formatGmailDateChile("2026-07-24T12:05:00.000Z", NOW),
    ).toBe("08:05");
  });

  it("muestra día y mes para una fecha del mismo año", () => {
    expect(
      formatGmailDateChile("2026-01-05T15:00:00.000Z", NOW),
    ).toBe("5 ene");
  });

  it("respeta el cambio de día en zona Chile", () => {
    expect(
      formatGmailDateChile("2026-07-24T02:30:00.000Z", NOW),
    ).toBe("23 jul");
  });

  it("muestra dd/mm/aa para años anteriores", () => {
    expect(
      formatGmailDateChile("2025-12-31T15:00:00.000Z", NOW),
    ).toBe("31/12/25");
  });

  it("devuelve vacío para valores ausentes o inválidos", () => {
    expect(formatGmailDateChile(null, NOW)).toBe("");
    expect(formatGmailDateChile("fecha-inválida", NOW)).toBe("");
  });
});
