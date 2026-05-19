import { describe, it, expect } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { evaluateWriteOff } from "../write-off.service";

describe("evaluateWriteOff", () => {
  const baseConfig = {
    writeOffAutoEnabled: true,
    writeOffMaxAmountClp: 10000,
    writeOffMaxPercent: new Decimal("0.005"),
    writeOffShortPaymentAccountId: "short-account-id",
    writeOffOverPaymentAccountId: "over-account-id",
  };

  it("aplica write-off SHORT cuando varianza UF típica ($300 sobre $5M)", () => {
    const result = evaluateWriteOff(4_917_533, 4_917_233, baseConfig);
    expect(result.shouldApply).toBe(true);
    expect(result.direction).toBe("SHORT");
    expect(result.accountId).toBe("short-account-id");
  });

  it("aplica write-off OVER cuando cliente paga $200 de más", () => {
    const result = evaluateWriteOff(5_000_000, 5_000_200, baseConfig);
    expect(result.shouldApply).toBe(true);
    expect(result.direction).toBe("OVER");
    expect(result.accountId).toBe("over-account-id");
  });

  it("NO aplica write-off cuando varianza excede absoluto ($15.000 > $10.000)", () => {
    const result = evaluateWriteOff(5_000_000, 4_985_000, baseConfig);
    expect(result.shouldApply).toBe(false);
    expect(result.reason).toContain("variance_exceeds_tolerance");
  });

  it("NO aplica cuando varianza excede 0,5% relativo (factura chica)", () => {
    // total=50.000, 0,5% = 250, absoluto cap 10.000 — gana el menor (250).
    const result = evaluateWriteOff(50_000, 49_700, baseConfig);
    expect(result.shouldApply).toBe(false);
  });

  it("aplica cuando varianza está dentro del 0,5% en factura grande", () => {
    // total=100M, 0,5% = 500.000, absoluto cap 10.000 — gana absoluto.
    // varianza $5.000 < $10.000 → aplica.
    const result = evaluateWriteOff(100_000_000, 99_995_000, baseConfig);
    expect(result.shouldApply).toBe(true);
    expect(result.direction).toBe("SHORT");
  });

  it("NO aplica cuando varianza es enorme (pago parcial real)", () => {
    const result = evaluateWriteOff(5_000_000, 2_000_000, baseConfig);
    expect(result.shouldApply).toBe(false);
  });

  it("NO aplica cuando auto está deshabilitado", () => {
    const result = evaluateWriteOff(5_000_000, 4_999_700, {
      ...baseConfig,
      writeOffAutoEnabled: false,
    });
    expect(result.shouldApply).toBe(false);
    expect(result.reason).toBe("auto_disabled");
  });

  it("NO aplica SHORT si falta cuenta configurada", () => {
    const result = evaluateWriteOff(5_000_000, 4_999_700, {
      ...baseConfig,
      writeOffShortPaymentAccountId: null,
    });
    expect(result.shouldApply).toBe(false);
    expect(result.reason).toContain("no_account_configured_for_SHORT");
  });

  it("NO aplica OVER si falta cuenta configurada", () => {
    const result = evaluateWriteOff(5_000_000, 5_000_300, {
      ...baseConfig,
      writeOffOverPaymentAccountId: null,
    });
    expect(result.shouldApply).toBe(false);
    expect(result.reason).toContain("no_account_configured_for_OVER");
  });

  it("varianza ínfima (< 50 centavos) no dispara write-off (no necesario)", () => {
    const result = evaluateWriteOff(5_000_000, 4_999_999.7, baseConfig);
    expect(result.shouldApply).toBe(false);
    expect(result.reason).toBe("no_variance");
  });
});
