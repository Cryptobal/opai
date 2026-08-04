import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * Regresión: el Sheet base trae `fixed`. Si el consumidor agrega `relative`
 * (p. ej. para un panel absolute interno), twMerge elimina `fixed` y el
 * panel deja de anclarse al viewport — en móvil solo se ve el overlay gris.
 */
describe("BankTxReconcileSheet SheetContent className", () => {
  const sheetBase =
    "fixed z-50 gap-4 p-6 shadow-lg inset-x-0 bottom-0 border-t";

  it("mantiene fixed cuando no se pasa relative (móvil)", () => {
    const merged = cn(
      sheetBase,
      "flex flex-col overflow-hidden p-0 gap-0 z-[60]",
      "w-full h-[92dvh] max-h-[92dvh] rounded-t-2xl",
    );
    expect(merged.split(/\s+/)).toContain("fixed");
    expect(merged.split(/\s+/)).not.toContain("relative");
  });

  it("relative pisa fixed (anti-patrón documentado)", () => {
    const merged = cn(
      sheetBase,
      "flex flex-col overflow-hidden relative p-0 gap-0 z-[60]",
    );
    expect(merged.split(/\s+/)).toContain("relative");
    expect(merged.split(/\s+/)).not.toContain("fixed");
  });
});
