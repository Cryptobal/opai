import { describe, it, expect } from "vitest";
import { validateDoubleEntry } from "../../shared/validators/journal.validator";
import type { JournalLineInput } from "../../shared/types/accounting.types";

function makeLine(debit: number, credit: number): JournalLineInput {
  return { accountId: "acc-001", debit, credit };
}

describe("validateDoubleEntry", () => {
  // ── Valid cases ──

  it("should accept a balanced 2-line entry", () => {
    const lines: JournalLineInput[] = [makeLine(10000, 0), makeLine(0, 10000)];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(true);
    expect(result.totalDebit).toBe(10000);
    expect(result.totalCredit).toBe(10000);
    expect(result.error).toBeUndefined();
  });

  it("should accept a balanced multi-line entry", () => {
    const lines: JournalLineInput[] = [
      makeLine(5000, 0),
      makeLine(3000, 0),
      makeLine(0, 6000),
      makeLine(0, 2000),
    ];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(true);
    expect(result.totalDebit).toBe(8000);
    expect(result.totalCredit).toBe(8000);
  });

  it("should handle decimal amounts with rounding", () => {
    const lines: JournalLineInput[] = [
      makeLine(33.33, 0),
      makeLine(33.33, 0),
      makeLine(33.34, 0),
      makeLine(0, 100),
    ];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(true);
    expect(result.totalDebit).toBe(100);
    expect(result.totalCredit).toBe(100);
  });

  // ── Invalid: too few lines ──

  it("should reject an empty lines array", () => {
    const result = validateDoubleEntry([]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Un asiento requiere al menos 2 lineas");
  });

  it("should reject a single line", () => {
    const result = validateDoubleEntry([makeLine(1000, 0)]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Un asiento requiere al menos 2 lineas");
  });

  it("should reject null/undefined lines", () => {
    const result = validateDoubleEntry(null as unknown as JournalLineInput[]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Un asiento requiere al menos 2 lineas");
  });

  // ── Invalid: negative amounts ──

  it("should reject negative debit", () => {
    const lines: JournalLineInput[] = [makeLine(-100, 0), makeLine(0, 100)];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Los montos no pueden ser negativos");
  });

  it("should reject negative credit", () => {
    const lines: JournalLineInput[] = [makeLine(100, 0), makeLine(0, -100)];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Los montos no pueden ser negativos");
  });

  // ── Invalid: both debit and credit on same line ──

  it("should reject a line with both debit and credit > 0", () => {
    const lines: JournalLineInput[] = [makeLine(100, 50), makeLine(0, 50)];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Una linea no puede tener debito y credito al mismo tiempo");
  });

  // ── Invalid: zero amounts ──

  it("should reject a line with both debit and credit = 0", () => {
    const lines: JournalLineInput[] = [makeLine(0, 0), makeLine(100, 0)];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Una linea debe tener debito o credito mayor a cero");
  });

  // ── Invalid: unbalanced ──

  it("should reject an unbalanced entry", () => {
    const lines: JournalLineInput[] = [makeLine(10000, 0), makeLine(0, 5000)];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("Debitos (10000) no igualan creditos (5000)");
    expect(result.totalDebit).toBe(10000);
    expect(result.totalCredit).toBe(5000);
  });

  it("should reject slightly unbalanced amounts", () => {
    const lines: JournalLineInput[] = [makeLine(100.01, 0), makeLine(0, 100.02)];
    const result = validateDoubleEntry(lines);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("no igualan");
  });
});
