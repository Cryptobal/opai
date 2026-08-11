import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AssociatedRecordsPanel } from "../AssociatedRecordsPanel";

describe("AssociatedRecordsPanel", () => {
  it("abre onAdd al primer click aunque la sección esté colapsada", async () => {
    const onAdd = vi.fn();
    render(
      <AssociatedRecordsPanel
        sections={[
          {
            id: "deals",
            label: "Negocios",
            count: 0,
            onAdd,
            content: <div>Lista vacía</div>,
          },
        ]}
      />,
    );

    // Hay dos paneles (desktop + mobile); usamos el primer "+"
    const addButtons = screen.getAllByRole("button", { name: "Agregar Negocios" });
    fireEvent.click(addButtons[0]!);

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
  });
});
