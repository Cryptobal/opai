import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { cn } from "@/lib/utils";
import { EmisionConfirmDialog } from "../EmisionConfirmDialog";

const DIALOG_BASE =
  "fixed inset-x-0 bottom-0 z-50 grid w-full max-w-[100vw] gap-4 px-6 pt-6 max-h-[90dvh] overflow-y-auto overflow-x-hidden sm:max-h-[85dvh]";

const STICKY_LAYOUT =
  "z-[70] flex min-h-0 max-h-[min(90dvh,calc(100svh-1rem))] max-w-lg flex-col gap-0 overflow-hidden p-0 pb-[max(env(safe-area-inset-bottom),0.75rem)] sm:max-h-[min(85dvh,calc(100svh-2rem))] sm:pb-0";

const BASE_PROPS = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  loading: false,
  dteType: 33,
  receiver: {
    name: "Pine",
    rut: "76530382-6",
    email: "gabriel.godoy@pine.example",
  },
  totals: {
    netAmount: 351_008,
    taxAmount: 66_692,
    totalAmount: 417_700,
    currency: "CLP" as const,
  },
  lines: Array.from({ length: 8 }, (_, i) => ({
    itemName: `Exámenes SEL/ACHS adicionales julio 2026 línea ${i + 1}`,
    quantity: 1,
    unitPrice: 10_000,
  })),
  defaultBackofficeEmails: ["backoffice@example.com"],
  defaultBackofficeAlwaysSend: false,
};

describe("EmisionConfirmDialog layout (viewport)", () => {
  it("el fuente usa flex + overflow-hidden + footer sticky para no recortar Emitir", () => {
    const src = readFileSync(
      resolve(__dirname, "../EmisionConfirmDialog.tsx"),
      "utf8",
    );
    expect(src).toContain(STICKY_LAYOUT);
    expect(src).toContain(
      'className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-6 pb-4"',
    );
    expect(src).toContain(
      'className="shrink-0 space-y-3 border-t border-ds-border-subtle px-6 pt-3 pb-3 sm:py-4"',
    );
    expect(src).toContain('data-testid="emision-confirm-submit"');
  });

  it("overflow-hidden pisa overflow-y-auto del DialogContent base", () => {
    const merged = cn(DIALOG_BASE, STICKY_LAYOUT);
    const tokens = merged.split(/\s+/);
    expect(tokens).toContain("overflow-hidden");
    expect(tokens).toContain("flex");
    expect(tokens).not.toContain("overflow-y-auto");
    expect(tokens).not.toContain("grid");
    expect(tokens).toContain("z-[70]");
    expect(tokens).not.toContain("z-50");
  });

  it("muestra aviso y botones aunque haya muchas líneas", () => {
    render(<EmisionConfirmDialog {...BASE_PROPS} />);

    expect(screen.getByTestId("emision-confirm-dialog")).toBeTruthy();
    expect(
      screen.getByText(/Una vez emitido, el DTE se envía al SII/i),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Cancelar" }),
    ).toBeTruthy();
    expect(screen.getByTestId("emision-confirm-submit")).toHaveTextContent(
      "Emitir y enviar al SII",
    );
  });

  it("confirmar entrega autoSendEmail y sendXmlToBackoffice", () => {
    const onConfirm = vi.fn();
    render(<EmisionConfirmDialog {...BASE_PROPS} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByTestId("emision-confirm-submit"));

    expect(onConfirm).toHaveBeenCalledWith({
      autoSendEmail: true,
      sendXmlToBackoffice: true,
    });
  });
});
