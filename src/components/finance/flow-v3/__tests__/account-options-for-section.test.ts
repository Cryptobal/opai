import { describe, expect, it } from "vitest";
import {
  filterAccountOptionsForSection,
  accountHintForSection,
} from "../account-options-for-section";

const opts = [
  { id: "1", code: "6.1.02.001", name: "Arriendo", type: "EXPENSE", label: "6.1.02.001 · Arriendo" },
  { id: "2", code: "1.1.01.010", name: "Banco", type: "ASSET", label: "1.1.01.010 · Banco" },
  { id: "3", code: "2.1.02.001", name: "IVA", type: "LIABILITY", label: "2.1.02.001 · IVA" },
  { id: "4", code: "5.1.01.001", name: "Sueldos", type: "COST", label: "5.1.01.001 · Sueldos" },
].map((o) => ({ id: o.id, code: o.code, type: o.type, label: o.label }));

describe("filterAccountOptionsForSection", () => {
  it("en GAV prioriza gastos (no bancos)", () => {
    const ids = filterAccountOptionsForSection(opts, "GAV").map((o) => o.id);
    expect(ids).toContain("1");
    expect(ids).not.toContain("2");
  });

  it("en IMPUESTOS ofrece pasivos", () => {
    const ids = filterAccountOptionsForSection(opts, "IMPUESTOS").map((o) => o.id);
    expect(ids).toContain("3");
    expect(ids).not.toContain("2");
  });

  it("en FINANCIAMIENTO incluye activo/pasivo/patrimonio", () => {
    const ids = filterAccountOptionsForSection(opts, "FINANCIAMIENTO").map((o) => o.id);
    expect(ids).toContain("2");
    expect(ids).toContain("3");
  });
});

describe("accountHintForSection", () => {
  it("explica GAV sin bancos", () => {
    expect(accountHintForSection("GAV")).toMatch(/gasto/i);
  });
});
