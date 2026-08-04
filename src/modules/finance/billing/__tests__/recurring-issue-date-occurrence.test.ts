import { describe, it, expect } from "vitest";
import { computeRecurringIssueYmd } from "../dte-recurring-schedule";
import { formatDateOnlyUtcYmd } from "@/lib/fx-date";

/**
 * Contrato v4.6: el borrador usa el día de la ocurrencia; la proyección
 * scheduled sigue usando computeRecurringIssueYmd (MES_SIGUIENTE intacto).
 */
describe("recurring draft issueDate = occurrence (v4.6)", () => {
  const mesSiguiente = {
    facturaTiming: "DIA_ESPECIFICO" as const,
    facturaDay: 1,
    facturaMesRelativo: "MES_SIGUIENTE",
    dayOfMonth: 20,
  };

  it("proyección scheduled sigue en mes siguiente", () => {
    const anchor = new Date(Date.UTC(2026, 6, 20)); // 20-jul
    expect(computeRecurringIssueYmd(mesSiguiente, anchor)).toBe("2026-08-01");
  });

  it("fecha del documento = día de la ocurrencia (sin corrimiento)", () => {
    const issueAnchor = new Date(Date.UTC(2026, 6, 20));
    // Misma fórmula que dte-recurring.service tras el fix.
    const issueDate = formatDateOnlyUtcYmd(issueAnchor);
    expect(issueDate).toBe("2026-07-20");
    expect(issueDate).not.toBe(computeRecurringIssueYmd(mesSiguiente, issueAnchor));
  });

  it("Embajada: prog 20 → proyección 15 mes sig; documento = 20", () => {
    const embajada = {
      ...mesSiguiente,
      facturaDay: 15,
    };
    const anchor = new Date(Date.UTC(2026, 6, 20));
    expect(computeRecurringIssueYmd(embajada, anchor)).toBe("2026-08-15");
    expect(formatDateOnlyUtcYmd(anchor)).toBe("2026-07-20");
  });
});
