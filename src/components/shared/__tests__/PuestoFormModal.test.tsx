import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PuestoFormModal } from "../PuestoFormModal";

vi.mock("@/components/ui/date-picker", () => ({
  DatePickerField: () => null,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const CARGO_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  fetchMock.mockReset();
});

describe("PuestoFormModal catalogs", () => {
  it("carga un solo endpoint ops y puebla cargo, puesto, rol y bonos", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          cargos: [{ id: CARGO_ID, name: "Guardia", active: true }],
          roles: [{ id: "22222222-2222-4222-8222-222222222222", name: "4x4", description: "turno", active: true }],
          puestos: [{ id: "33333333-3333-4333-8333-333333333333", name: "Portería", active: true }],
          bonos: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              code: "RESP",
              name: "Bono responsabilidad",
              bonoType: "FIJO",
              isTaxable: true,
              isTributable: true,
              defaultAmount: 35000,
              defaultPercentage: null,
              active: true,
            },
          ],
          payrollEnabled: true,
        },
      }),
    });

    render(
      <PuestoFormModal open onOpenChange={() => {}} onSave={vi.fn()} />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/ops/puestos/catalogos");
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("option", { name: "Guardia" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Portería" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "4x4 (turno)" })).toBeInTheDocument();
    expect(screen.getByText("Bonos")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calcular sueldo líquido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
  });

  it("muestra error inline y bloquea Guardar si el catálogo falla", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ success: false, error: "Sin permisos para módulo Ops" }),
    });

    render(
      <PuestoFormModal open onOpenChange={() => {}} onSave={vi.fn()} />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sin permisos para módulo Ops",
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
  });

  it("pasa includeIds de un puesto en edición e inactivos con sufijo", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          cargos: [{ id: CARGO_ID, name: "Guardia", active: false }],
          roles: [],
          puestos: [],
          bonos: [],
          payrollEnabled: false,
        },
      }),
    });

    render(
      <PuestoFormModal
        open
        onOpenChange={() => {}}
        onSave={vi.fn()}
        initialData={{ cargoId: CARGO_ID }}
      />,
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/ops/puestos/catalogos?includeIds=${CARGO_ID}`,
      );
    });
    expect(screen.getByRole("option", { name: "Guardia (inactivo)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Calcular sueldo líquido" })).not.toBeInTheDocument();
  });
});
