/**
 * v5.2 — creación en contexto: sección bloqueada + checkbox recurrencia.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddRowDialog } from "../AddRowDialog";

vi.mock("@/components/ui/SearchableSelect", () => ({
  SearchableSelect: () => <div data-testid="searchable-select" />,
}));

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/accounting/accounts")) {
        return {
          json: async () => ({
            data: [{ id: "ap-tgr", code: "2101", name: "TGR", acceptsEntries: true }],
          }),
        };
      }
      return { json: async () => ({ data: [] }) };
    }),
  );
});

describe("AddRowDialog — sección prefijada y recurrencia", () => {
  it("con lockedSection muestra la sección bloqueada (no editable)", async () => {
    render(
      <AddRowDialog
        open
        onOpenChange={() => {}}
        busy={false}
        lockedSection="FINANCIAMIENTO"
        onCreate={async () => null}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("add-row-section-locked")).toBeTruthy();
    });
    const locked = screen.getByTestId("add-row-section-locked") as HTMLInputElement;
    expect(locked.disabled).toBe(true);
    expect(locked.value).toMatch(/Financiamiento/i);
  });

  it("en Financiamiento ofrece checkbox Configurar recurrencia al crear", async () => {
    render(
      <AddRowDialog
        open
        onOpenChange={() => {}}
        busy={false}
        lockedSection="FINANCIAMIENTO"
        onCreate={async () => null}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("add-row-configure-recurrence")).toBeTruthy();
    });
    expect(screen.getByText("Configurar recurrencia al crear")).toBeTruthy();
  });

  it("en INGRESOS no muestra el checkbox de recurrencia", async () => {
    render(
      <AddRowDialog
        open
        onOpenChange={() => {}}
        busy={false}
        lockedSection="INGRESOS"
        onCreate={async () => null}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId("add-row-section-locked")).toBeTruthy();
    });
    expect(screen.queryByTestId("add-row-configure-recurrence")).toBeNull();
  });

  it("al crear con recurrencia marcada llama onCreated con configureRecurrence=true", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const onCreate = vi.fn(async () => ({
      id: "row-new",
      section: "FINANCIAMIENTO",
      name: "Crédito · TGR",
    }));

    render(
      <AddRowDialog
        open
        onOpenChange={onOpenChange}
        busy={false}
        lockedSection="FINANCIAMIENTO"
        onCreate={onCreate}
        onCreated={onCreated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("add-row-configure-recurrence")).toBeTruthy();
    });

    // Nombre manual (cuenta contable opcional en egresos).
    const nameInput = screen.getByPlaceholderText(/Nombre visible/i);
    fireEvent.change(nameInput, { target: { value: "Crédito · TGR" } });
    fireEvent.click(screen.getByTestId("add-row-configure-recurrence"));
    fireEvent.click(screen.getByRole("button", { name: /Crear fila/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalledWith(
        { id: "row-new", section: "FINANCIAMIENTO", name: "Crédito · TGR" },
        { configureRecurrence: true },
      );
    });
  });

  it("sin lockedSection el select de sección es editable (botón global)", async () => {
    render(
      <AddRowDialog
        open
        onOpenChange={() => {}}
        busy={false}
        onCreate={async () => null}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("add-row-section-locked")).toBeNull();
    });
    expect(screen.getByText("Sección")).toBeTruthy();
  });

  it("initialSection + cuenta precarga sección editable (no locked)", async () => {
    render(
      <AddRowDialog
        open
        onOpenChange={() => {}}
        busy={false}
        initialSection="IMPUESTOS"
        presetAccountPlanIds={["ap-tgr"]}
        presetName="T.G.R."
        onCreate={async () => null}
      />,
    );
    await waitFor(() => {
      expect(screen.queryByTestId("add-row-section-locked")).toBeNull();
    });
    // Select editable (no input disabled) y recurrencia disponible en IMPUESTOS.
    await waitFor(() => {
      expect(screen.getByTestId("add-row-configure-recurrence")).toBeTruthy();
    });
    // Sección inicial IMPUESTOS (el hint también menciona la palabra; hay ≥1).
    expect(screen.getAllByText(/Impuestos/i).length).toBeGreaterThanOrEqual(1);
  });
});
