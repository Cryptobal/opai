import { describe, it, expect } from "vitest";
import { isBankBornManualExpense } from "../projection.service";

/**
 * BLOQUE 1 — flag `isConciliacion`.
 *
 * `isBankBornManualExpense` decide si un item MANUAL/EXPENSE nació de una
 * conciliación bancaria (rama B de `assignBankTxToCategory`) — el único caso
 * de item con `name` = glosa del banco que la grilla debe colapsar por cuenta.
 *
 * El bank-link huérfano (`Conciliación · <cat>`) usa una regla aparte
 * (`cat.kind === "EXPENSE"`), verificada al final.
 */
describe("isBankBornManualExpense", () => {
  const base = {
    source: "MANUAL",
    kind: "EXPENSE",
    crmAccountId: null as string | null,
    installationId: null as string | null,
  };

  it("MANUAL/EXPENSE sin crm ni instalación y con bank-tx → true", () => {
    expect(isBankBornManualExpense(base, "tx_1")).toBe(true);
  });

  it("MANUAL/EXPENSE sin bank-tx (gasto cargado a mano, no conciliado) → falsy", () => {
    // Protege contra el falso positivo: un gasto manual legítimo aún sin
    // conciliar NO debe colapsarse dentro de una cuenta.
    expect(isBankBornManualExpense(base, null)).toBe(false);
  });

  it("MANUAL/EXPENSE con installationId seteado → falsy", () => {
    expect(
      isBankBornManualExpense({ ...base, installationId: "inst_1" }, "tx_1"),
    ).toBe(false);
  });

  it("MANUAL/EXPENSE con crmAccountId seteado → falsy", () => {
    expect(
      isBankBornManualExpense({ ...base, crmAccountId: "crm_1" }, "tx_1"),
    ).toBe(false);
  });

  it("item de INCOME conciliado → falsy (los ingresos no se colapsan)", () => {
    expect(isBankBornManualExpense({ ...base, kind: "INCOME" }, "tx_1")).toBe(
      false,
    );
  });

  it("source distinto de MANUAL (contrato/nómina) → falsy", () => {
    expect(
      isBankBornManualExpense({ ...base, source: "CONTRACT" }, "tx_1"),
    ).toBe(false);
  });
});

describe("bank-link huérfano — regla isConciliacion", () => {
  // Réplica de la condición aplicada al push del bank-link huérfano
  // (`isConciliacion: cat.kind === "EXPENSE"`).
  const isConciliacionOrphan = (catKind: string) => catKind === "EXPENSE";

  it("bank-link huérfano de EGRESO → isConciliacion true", () => {
    expect(isConciliacionOrphan("EXPENSE")).toBe(true);
  });

  it("bank-link huérfano de INGRESO → isConciliacion falsy", () => {
    expect(isConciliacionOrphan("INCOME")).toBe(false);
  });
});
