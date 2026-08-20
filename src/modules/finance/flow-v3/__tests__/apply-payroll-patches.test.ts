import { describe, expect, it } from "vitest";
import { applyPayrollPatchesToMilestones } from "../apply-payroll-patches";

describe("applyPayrollPatchesToMilestones", () => {
  it("descuenta el líquido OPERATIVO y no toca el admin", () => {
    const next = applyPayrollPatchesToMilestones(
      [
        {
          key: "liquido",
          dateYmd: "2026-08-31",
          amountClp: 90_000_000,
          laborClass: "OPERATIVO",
          label: "Sueldos guardias",
        },
        {
          key: "liquido",
          dateYmd: "2026-08-31",
          amountClp: 4_000_000,
          laborClass: "ADMINISTRATIVO",
          label: "Sueldos equipo interno",
        },
      ],
      [
        {
          key: "liquido",
          dateYmd: "2026-08-31",
          amountClp: 72_000_000,
          metaNote: "desc. TE $18.000.000",
        },
      ],
    );
    expect(next[0].amountClp).toBe(72_000_000);
    expect(next[0].metaNote).toContain("TE");
    expect(next[1].amountClp).toBe(4_000_000);
  });

  it("cae al padre SUELDO si no hay hijo operativo", () => {
    const next = applyPayrollPatchesToMilestones(
      [
        { key: "SUELDO", dateYmd: "2026-08-31", amountClp: 90_000_000, label: "Sueldos" },
        {
          key: "liquido",
          dateYmd: "2026-08-31",
          amountClp: 3_000_000,
          laborClass: "ADMINISTRATIVO",
        },
      ],
      [{ key: "liquido", dateYmd: "2026-08-31", amountClp: 70_000_000 }],
    );
    expect(next[0].amountClp).toBe(70_000_000);
    expect(next[1].amountClp).toBe(3_000_000);
  });

  it("no aplica si solo existe el hito admin", () => {
    const next = applyPayrollPatchesToMilestones(
      [
        {
          key: "liquido",
          dateYmd: "2026-08-31",
          amountClp: 4_000_000,
          laborClass: "ADMINISTRATIVO",
        },
      ],
      [{ key: "liquido", dateYmd: "2026-08-31", amountClp: 1 }],
    );
    expect(next[0].amountClp).toBe(4_000_000);
  });
});
