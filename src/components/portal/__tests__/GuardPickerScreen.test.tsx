/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { GuardPickerScreen } from "../GuardPickerScreen";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("GuardPickerScreen", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("muestra el título y carga guardias asignados", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: [{ id: "g1", name: "Soto Ana" }],
      }),
    });

    render(
      <GuardPickerScreen
        installationName="Angloamerican"
        deviceToken="tok"
        onGuardSelected={vi.fn()}
      />,
    );

    expect(screen.getByText("¿Quién está de turno?")).toBeInTheDocument();
    expect(screen.getByText("Angloamerican")).toBeInTheDocument();
    expect(await screen.findByText("Soto Ana")).toBeInTheDocument();
  });

  it("muestra empty state si no hay asignados", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(
      <GuardPickerScreen
        installationName="Angloamerican"
        deviceToken="tok"
        onGuardSelected={vi.fn()}
      />,
    );

    expect(
      await screen.findByText("No hay guardias asignados"),
    ).toBeInTheDocument();
    expect(screen.getByText("Identifícate con RUT y PIN")).toBeInTheDocument();
  });

  it("identifica con RUT y PIN cuando la lista está vacía", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: { id: "g9", name: "Perez Luis" } }),
      });

    const onGuardSelected = vi.fn();
    render(
      <GuardPickerScreen
        installationName="Angloamerican"
        deviceToken="tok"
        onGuardSelected={onGuardSelected}
      />,
    );

    await screen.findByText("No hay guardias asignados");

    fireEvent.change(screen.getByPlaceholderText("12.345.678-9"), {
      target: { value: "111111111" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••"), {
      target: { value: "1234" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => {
      expect(onGuardSelected).toHaveBeenCalledWith({ id: "g9", name: "Perez Luis" });
    });

    const identifyCall = fetchMock.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("identify-guard"),
    );
    expect(identifyCall).toBeTruthy();
  });
});
