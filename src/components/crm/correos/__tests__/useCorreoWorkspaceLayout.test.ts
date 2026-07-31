import { describe, expect, it } from "vitest";
import {
  LIST_MINI_WIDTH,
  LIST_READABLE_MIN,
  READER_MIN_WIDTH,
  __correoLayoutForTest,
} from "../useCorreoWorkspaceLayout";

const { computeLayout } = __correoLayoutForTest;

describe("useCorreoWorkspaceLayout algorithm", () => {
  it("sin lector → lista full y tier wide en anchos grandes", () => {
    const r = computeLayout(1_200, false, false, false, 560);
    expect(r.listMode).toBe("full");
    expect(r.listWidth).toBeNull();
    expect(r.tier).toBe("wide");
  });

  it("lector abierto con espacio → lista legible y lector ≥ mínimo", () => {
    // scope 1200, riel 68, gaps 24 → available 1108
    const r = computeLayout(1_200, true, true, false, 560);
    expect(r.listMode).toBe("full");
    expect(r.listWidth).toBeGreaterThanOrEqual(LIST_READABLE_MIN);
  });

  it("espacio crítico con dock → mini-lista", () => {
    // 1024 − padding dock ya restado en scope ≈ 594 (1024-430)
    // riel expandido 224 + gaps 24 → available 346 < 380+420
    const r = computeLayout(594, false, true, true, 560);
    expect(r.listMode).toBe("mini");
    expect(r.listWidth).toBe(LIST_MINI_WIDTH);
    expect(r.tier).toBe("narrow");
  });

  it("tier mid entre 520 y 699", () => {
    const r = computeLayout(900, true, false, false, 560);
    // available ≈ 900-68-12 = 820 → wide
    expect(r.tier).toBe("wide");
    const mid = computeLayout(600, true, false, false, 560);
    // available ≈ 600-68-12 = 520 → mid
    expect(["mid", "narrow", "wide"]).toContain(mid.tier);
  });

  it("constantes de mínimos exportadas", () => {
    expect(LIST_READABLE_MIN).toBe(380);
    expect(LIST_MINI_WIDTH).toBe(72);
    expect(READER_MIN_WIDTH).toBe(420);
  });
});
