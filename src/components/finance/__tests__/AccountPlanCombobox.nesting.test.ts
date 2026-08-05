import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Regresión: AccountPlanCombobox (móvil) abre un Sheet anidado desde
 * BankTxReconcileSheet / AllocationDetailPanel, que viven en z-[60].
 * Si el picker queda en z-50 (default del Sheet), el buscador queda detrás
 * del sheet padre: el teclado se abre pero no hay dónde escribir.
 */
describe("AccountPlanCombobox mobile Sheet nesting z-index", () => {
  const sheetBase =
    "fixed z-50 gap-4 p-6 shadow-lg inset-x-0 bottom-0 border-t bg-background";

  it("el fuente declara z-[70] en content y overlay del Sheet móvil", () => {
    const src = readFileSync(
      resolve(__dirname, "../AccountPlanCombobox.tsx"),
      "utf8",
    );
    expect(src).toContain('overlayClassName="z-[70] bg-black/40"');
    expect(src).toContain("z-[70]");
    expect(src).toContain('surface="opaque"');
  });

  it("z-[70] pisa el z-50 del Sheet base (mismo patrón que EmisionConfirmDialog)", () => {
    const merged = cn(
      sheetBase,
      "p-0 gap-0 flex flex-col max-h-[85dvh] rounded-t-2xl z-[70]",
    );
    expect(merged.split(/\s+/)).toContain("z-[70]");
    expect(merged.split(/\s+/)).not.toContain("z-50");
  });

  it("overlay anidado también queda por encima del sheet padre z-[60]", () => {
    const overlayBase = "fixed inset-0 z-50 bg-black/80";
    const merged = cn(overlayBase, "z-[70] bg-black/40");
    expect(merged.split(/\s+/)).toContain("z-[70]");
    expect(merged.split(/\s+/)).not.toContain("z-50");
  });
});
