/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { DecisionScreen } from "../DecisionScreen";

describe("DecisionScreen", () => {
  it("porta el overlay a document.body con z-[60] por encima del bottom nav", async () => {
    await act(async () => {
      render(
        <div data-testid="app-shell">
          <DecisionScreen
            authorized
            name="Persona de Prueba"
            rut="12.345.678-5"
            confirmLabel="REGISTRAR INGRESO"
            onConfirm={vi.fn()}
          />
        </div>,
      );
    });

    await waitFor(() => {
      const cta = screen.getByRole("button", { name: "REGISTRAR INGRESO" });
      expect(cta).toBeTruthy();
      const overlay = cta.closest("[role='status']");
      expect(overlay).toBeTruthy();
      expect(overlay!.className).toContain("z-[60]");
      expect(overlay!.className).toContain("fixed");
      // Fuera del shell: portal a body evita que el nav (z-50) lo tape.
      expect(overlay!.parentElement).toBe(document.body);
      expect(document.querySelector('[data-testid="app-shell"]')?.contains(overlay)).toBe(false);
    });
  });

  it("muestra el CTA de rechazo en denegaciones", async () => {
    await act(async () => {
      render(
        <DecisionScreen
          authorized={false}
          rut="11.111.111-1"
          confirmLabel="REGISTRAR RECHAZO"
          onConfirm={vi.fn()}
        />,
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "REGISTRAR RECHAZO" })).toBeTruthy();
      expect(screen.getByText("NO AUTORIZADO")).toBeTruthy();
    });
  });
});
