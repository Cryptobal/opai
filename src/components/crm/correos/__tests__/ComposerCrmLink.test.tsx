import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ComposerCrmLink } from "../ComposerCrmLink";

describe("ComposerCrmLink", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo) => {
        const url = String(input);
        if (url.includes("/api/agenda/cuentas")) {
          return {
            ok: true,
            json: async () => ({
              items: [{ id: "acc-1", name: "ACUDA Western Union", rut: "76.123.456-7" }],
            }),
          };
        }
        if (url.includes("/api/crm/correos/deals-for-account")) {
          return {
            ok: true,
            json: async () => ({
              items: [
                { id: "deal-1", title: "Cotización WU", status: "open" },
                { id: "deal-2", title: "Cerrado viejo", status: "won" },
              ],
            }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );
  });

  it("muestra CTA vacío y permite asociar cuenta + negocio", async () => {
    const onChange = vi.fn();
    render(
      <ComposerCrmLink
        value={{ accountId: null, accountName: null, dealId: null }}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /asociar a cuenta o negocio/i }));
    const input = screen.getByLabelText(/buscar cuenta crm/i);
    fireEvent.change(input, { target: { value: "acuda" } });

    await waitFor(() => {
      expect(screen.getByText("ACUDA Western Union")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("ACUDA Western Union"));

    expect(onChange).toHaveBeenCalledWith({
      accountId: "acc-1",
      accountName: "ACUDA Western Union",
      dealId: null,
    });
  });

  it("con cuenta muestra chip y permite quitarla", async () => {
    const onChange = vi.fn();
    render(
      <ComposerCrmLink
        value={{
          accountId: "acc-1",
          accountName: "ACUDA Western Union",
          dealId: null,
        }}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("ACUDA Western Union")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText("Negocio asociado")).toBeTruthy();
    });
    fireEvent.click(screen.getByLabelText("Quitar cuenta"));
    expect(onChange).toHaveBeenCalledWith({
      accountId: null,
      accountName: null,
      dealId: null,
    });
  });
});
