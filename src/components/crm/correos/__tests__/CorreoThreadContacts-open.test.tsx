/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/components/ui/confirm-service", () => ({
  confirmDialog: vi.fn(),
}));

vi.mock("../CorreoWorkContext", () => ({
  useCorreoWorkOptional: () => null,
}));

import { CorreoThreadContacts } from "../CorreoThreadContacts";

describe("CorreoThreadContacts — abrir ficha", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          contacts: [
            {
              id: "link_1",
              contactId: "c_1",
              name: "Sergio Quiroga",
              email: "sergio@ejemplo.cl",
              accountId: "acc_1",
              addedVia: "manual",
              isPrimary: true,
            },
          ],
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("expone botón para abrir la ficha del contacto", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CorreoThreadContacts threadId="thr_1" accountId="acc_1" />);

    await waitFor(() => {
      expect(screen.getByText("Sergio Quiroga")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Abrir ficha de Sergio Quiroga/i }));
    expect(openSpy).toHaveBeenCalledWith(
      "/crm/contacts/c_1",
      "_blank",
      "noopener,noreferrer",
    );
    openSpy.mockRestore();
  });
});
