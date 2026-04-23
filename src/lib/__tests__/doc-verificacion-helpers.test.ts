import { describe, it, expect } from "vitest";
import {
  calcCellStatus,
  calcCompliancePercent,
  type CellStatus,
} from "../doc-verificacion-helpers";

describe("calcCellStatus", () => {
  it("returns 'completo' when digital vigente + physical verified", () => {
    const result = calcCellStatus("vigente", true);
    expect(result).toEqual<CellStatus>({
      digital: "ok",
      fisico: "ok",
    });
  });

  it("returns 'parcial' when digital vigente but no physical check", () => {
    const result = calcCellStatus("vigente", null);
    expect(result).toEqual<CellStatus>({
      digital: "ok",
      fisico: "pendiente",
    });
  });

  it("returns 'parcial' when digital vigente but physical not found", () => {
    const result = calcCellStatus("vigente", false);
    expect(result).toEqual<CellStatus>({
      digital: "ok",
      fisico: "falta",
    });
  });

  it("returns 'faltante' when no digital document", () => {
    const result = calcCellStatus("sin_documento", null);
    expect(result).toEqual<CellStatus>({
      digital: "falta",
      fisico: "pendiente",
    });
  });

  it("returns digital warning for por_vencer", () => {
    const result = calcCellStatus("por_vencer", true);
    expect(result).toEqual<CellStatus>({
      digital: "alerta",
      fisico: "ok",
    });
  });

  it("returns digital falta for vencido", () => {
    const result = calcCellStatus("vencido", true);
    expect(result).toEqual<CellStatus>({
      digital: "falta",
      fisico: "ok",
    });
  });

  it("treats no_aplica as digital ok (doc sin vencimiento)", () => {
    const result = calcCellStatus("no_aplica", null);
    expect(result).toEqual<CellStatus>({
      digital: "ok",
      fisico: "pendiente",
    });
  });

  it("no_aplica + fisica verificada cuenta como celda completa", () => {
    const result = calcCellStatus("no_aplica", true);
    expect(result).toEqual<CellStatus>({
      digital: "ok",
      fisico: "ok",
    });
  });
});

describe("calcCompliancePercent", () => {
  it("returns 100 when all cells are ok/ok", () => {
    const cells: CellStatus[] = [
      { digital: "ok", fisico: "ok" },
      { digital: "ok", fisico: "ok" },
    ];
    expect(calcCompliancePercent(cells)).toBe(100);
  });

  it("returns 50 when half checks are green", () => {
    const cells: CellStatus[] = [
      { digital: "ok", fisico: "ok" },
      { digital: "falta", fisico: "falta" },
    ];
    expect(calcCompliancePercent(cells)).toBe(50);
  });

  it("returns 0 for empty cells", () => {
    expect(calcCompliancePercent([])).toBe(0);
  });

  it("counts digital ok + fisico pendiente as 1 of 2", () => {
    const cells: CellStatus[] = [
      { digital: "ok", fisico: "pendiente" },
    ];
    expect(calcCompliancePercent(cells)).toBe(50);
  });
});
