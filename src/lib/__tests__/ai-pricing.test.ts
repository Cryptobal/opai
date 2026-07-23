import { describe, it, expect } from "vitest";
import { priceFor, computeCostUSD } from "@/lib/ai-pricing";

describe("priceFor", () => {
  it("match exacto", () => {
    expect(priceFor("gpt-4o-mini")).toMatchObject({ inputPerM: 0.15 });
  });

  it("match por prefijo (tolera sufijo de fecha)", () => {
    expect(priceFor("claude-haiku-4-5-20251001")).toMatchObject({ inputPerM: 1, outputPerM: 5 });
  });

  it("null para modelo desconocido", () => {
    expect(priceFor("modelo-inexistente-xyz")).toBeNull();
  });
});

describe("computeCostUSD", () => {
  it("calcula costo por tokens", () => {
    const r = computeCostUSD("gpt-4o-mini", 1_000_000, 1_000_000);
    // 0.15 (in) + 0.60 (out)
    expect(r.priced).toBe(true);
    expect(r.usd).toBeCloseTo(0.75, 5);
  });

  it("modelo sin tarifa por tokens (whisper) → priced=false", () => {
    expect(computeCostUSD("whisper-1", 1000, 0)).toMatchObject({ priced: false, usd: 0 });
  });

  it("modelo desconocido → priced=false", () => {
    expect(computeCostUSD("no-existe", 1000, 1000)).toMatchObject({ priced: false, usd: 0 });
  });
});
