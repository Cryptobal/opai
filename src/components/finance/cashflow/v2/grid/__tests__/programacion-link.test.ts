import { describe, expect, it } from "vitest";
import {
  programacionHrefForCashflowItem,
  resolveCashflowItemIdForProgramacion,
} from "../programacion-link";

const REAL_ID = "a1b2c3d4-e5f6-4789-a012-3456789abcde";

describe("resolveCashflowItemIdForProgramacion", () => {
  it("acepta UUID real", () => {
    expect(resolveCashflowItemIdForProgramacion(REAL_ID)).toBe(REAL_ID);
  });

  it("desenvuelve _prog:<uuid>:fecha", () => {
    expect(
      resolveCashflowItemIdForProgramacion(`_prog:${REAL_ID}:2026-08-03`),
    ).toBe(REAL_ID);
  });

  it("rechaza ids sintéticos", () => {
    expect(resolveCashflowItemIdForProgramacion(`_dte:${REAL_ID}`)).toBeNull();
    expect(resolveCashflowItemIdForProgramacion("_orphan")).toBeNull();
    expect(resolveCashflowItemIdForProgramacion("_periodic:RECURRING_DTE")).toBeNull();
    expect(resolveCashflowItemIdForProgramacion(null)).toBeNull();
  });
});

describe("programacionHrefForCashflowItem", () => {
  it("solo para RECURRING_DTE con item real", () => {
    expect(programacionHrefForCashflowItem("RECURRING_DTE", REAL_ID)).toBe(
      `/finanzas/facturacion/programacion?openCashflowItem=${REAL_ID}`,
    );
    expect(programacionHrefForCashflowItem("CONTRACT", REAL_ID)).toBeNull();
    expect(programacionHrefForCashflowItem("RECURRING_DTE", "_orphan")).toBeNull();
  });
});
