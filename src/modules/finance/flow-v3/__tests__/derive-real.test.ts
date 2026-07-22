import { describe, it, expect } from "vitest";
import { deriveReal, type DteRefInput, type RealTxInput } from "../derive-real";
import {
  UNMATCHED_EXPENSE_KEY,
  UNMATCHED_INCOME_KEY,
  type FlowRowRef,
} from "../types";
import { enumerateWeeks } from "../weeks";

const WEEKS = enumerateWeeks(
  new Date(Date.UTC(2026, 5, 22)),
  new Date(Date.UTC(2026, 7, 31)),
);

const ROWS: FlowRowRef[] = [
  { id: "row-cliA", name: "Cliente A", crmAccountId: "acc-A", installationId: null, categoryId: null, supplierId: null },
  { id: "row-arriendo", name: "Arriendo", crmAccountId: null, installationId: null, categoryId: "cat-arr", supplierId: null },
  { id: "row-sueldos", name: "Sueldos líquidos", crmAccountId: null, installationId: null, categoryId: "cat-sueldo", supplierId: null },
];
const CODES = new Map([
  ["cat-arr", "EGR_ARRIENDO"],
  ["cat-sueldo", "EGR_SUELDO"],
]);

function tx(over: Partial<RealTxInput>): RealTxInput {
  return { id: "tx-1", dateYmd: "2026-07-15", amountClp: 1_000_000, description: "TRANSFERENCIA", links: [], ...over };
}

const base = {
  rows: ROWS,
  weeks: WEEKS,
  dteById: new Map<string, DteRefInput>(),
  categoryIdByAccountPlanId: new Map<string, string>(),
  categoryCodeById: CODES,
};

describe("deriveReal", () => {
  it("abono conciliado a DTE emitido cae en la fila de la cuenta, semana del movimiento", () => {
    const dteById = new Map<string, DteRefInput>([
      ["dte-1", { folio: 321, direction: "ISSUED", crmAccountId: "acc-A", installationId: null, supplierId: null, categoryId: null, name: "Cliente A" }],
    ]);
    const out = deriveReal({
      ...base,
      dteById,
      txs: [tx({ links: [{ targetType: "DTE_ISSUED", targetId: "dte-1", amountClp: 1_000_000, accountPlanId: null }] })],
    });
    // 15-jul-2026 (miércoles) → semana lunes 13-jul
    const cell = out.get("row-cliA")?.get("2026-07-13");
    expect(cell?.total).toBe(1_000_000);
    expect(cell?.items[0]).toMatchObject({ folio: 321, bankTransactionId: "tx-1" });
  });

  it("cargo con link EXPENSE rutea por cuenta contable → categoría → fila", () => {
    const out = deriveReal({
      ...base,
      categoryIdByAccountPlanId: new Map([["plan-arr", "cat-arr"]]),
      txs: [tx({
        amountClp: -450_000,
        links: [{ targetType: "EXPENSE", targetId: null, amountClp: 450_000, accountPlanId: "plan-arr" }],
      })],
    });
    expect(out.get("row-arriendo")?.get("2026-07-13")?.total).toBe(-450_000);
  });

  it("cargo PAYROLL_LIQUIDACION usa el atajo EGR_SUELDO", () => {
    const out = deriveReal({
      ...base,
      txs: [tx({
        amountClp: -2_000_000,
        links: [{ targetType: "PAYROLL_LIQUIDACION", targetId: "liq-1", amountClp: 2_000_000, accountPlanId: null }],
      })],
    });
    expect(out.get("row-sueldos")?.get("2026-07-13")?.total).toBe(-2_000_000);
  });

  it("movimiento sin match cae en Otros según signo", () => {
    const out = deriveReal({
      ...base,
      txs: [
        tx({ id: "tx-in", amountClp: 99_000 }),
        tx({ id: "tx-out", amountClp: -55_000, description: "PAGO TARJETA" }),
      ],
    });
    expect(out.get(UNMATCHED_INCOME_KEY)?.get("2026-07-13")?.total).toBe(99_000);
    expect(out.get(UNMATCHED_EXPENSE_KEY)?.get("2026-07-13")?.total).toBe(-55_000);
  });

  it("remanente parcialmente conciliado va a Otros", () => {
    const dteById = new Map<string, DteRefInput>([
      ["dte-2", { folio: 400, direction: "ISSUED", crmAccountId: "acc-A", installationId: null, supplierId: null, categoryId: null, name: "Cliente A" }],
    ]);
    const out = deriveReal({
      ...base,
      dteById,
      txs: [tx({
        amountClp: 800_000,
        links: [{ targetType: "DTE_ISSUED", targetId: "dte-2", amountClp: 500_000, accountPlanId: null }],
      })],
    });
    expect(out.get("row-cliA")?.get("2026-07-13")?.total).toBe(500_000);
    expect(out.get(UNMATCHED_INCOME_KEY)?.get("2026-07-13")?.total).toBe(300_000);
  });

  it("movimiento fuera del rango se ignora", () => {
    const out = deriveReal({ ...base, txs: [tx({ dateYmd: "2026-09-15" })] });
    expect(out.size).toBe(0);
  });
});
