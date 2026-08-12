import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ClassifyToFlowRowDialog,
  groupFlowRowsBySection,
  type ClassifyFlowRowOption,
} from "../ClassifyToFlowRowDialog";

const FLOW_ROWS: ClassifyFlowRowOption[] = [
  {
    id: "row-aporte",
    name: "Aporte socios",
    section: "FINANCIAMIENTO",
    hasCategory: true,
  },
  {
    id: "row-devol",
    name: "Devolución a socios",
    section: "FINANCIAMIENTO",
    hasCategory: true,
  },
  {
    id: "row-retiro",
    name: "Retiro socios",
    section: "FINANCIAMIENTO",
    hasCategory: true,
  },
  {
    id: "row-finiquito",
    name: "Finiquitos",
    section: "REMUNERACIONES",
    hasCategory: true,
  },
];

describe("groupFlowRowsBySection", () => {
  it("agrupa sin perder ids únicos por fila", () => {
    const groups = groupFlowRowsBySection(FLOW_ROWS);
    expect(groups.map((g) => g.section)).toEqual([
      "FINANCIAMIENTO",
      "REMUNERACIONES",
    ]);
    expect(groups[0]!.rows.map((r) => r.id)).toEqual([
      "row-aporte",
      "row-devol",
      "row-retiro",
    ]);
  });
});

describe("groupFlowRowsBySection — ids estables para Select value", () => {
  it("conserva flowRowId UUID por fila (nunca label ni índice)", () => {
    const groups = groupFlowRowsBySection(FLOW_ROWS);
    const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(ids).toEqual([
      "row-aporte",
      "row-devol",
      "row-retiro",
      "row-finiquito",
    ]);
    expect(ids.every((id) => id.startsWith("row-"))).toBe(true);
    expect(ids).not.toContain("Devolución a socios");
    expect(ids).not.toContain("Aporte socios");
  });
});

describe("ClassifyToFlowRowDialog", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("no preselecciona la primera fila al abrir (evita falsa selección Aporte socios)", async () => {
    render(
      <ClassifyToFlowRowDialog
        open
        onOpenChange={() => {}}
        tx={{ id: "tx-1", description: "Pago socio", amount: -2_000_000 }}
        flowRows={FLOW_ROWS}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("classify-flow-row-select")).toBeTruthy();
    });
    expect(screen.queryByTestId("classify-flow-row-selected-label")).toBeNull();
    expect(
      (screen.getByTestId("classify-flow-row-confirm") as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("persiste el flowRowId elegido (Devolución) y no el de Aporte", async () => {
    render(
      <ClassifyToFlowRowDialog
        open
        onOpenChange={() => {}}
        tx={{ id: "tx-carlos", description: "Carlos Irigoyen", amount: -2_000_000 }}
        flowRows={FLOW_ROWS}
      />,
    );

    fireEvent.click(screen.getByTestId("classify-flow-row-select"));
    fireEvent.click(screen.getByTestId("flow-row-option-row-devol"));

    await waitFor(() => {
      expect(screen.getByTestId("classify-flow-row-selected-label").textContent).toContain(
        "Devolución a socios",
      );
    });

    fireEvent.click(screen.getByTestId("classify-flow-row-confirm"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.method)).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.flowRowId).toBe("row-devol");
    expect(body.flowRowId).not.toBe("row-aporte");
  });

  it("seleccionar Finiquitos actualiza la etiqueta visible (no Aporte socios)", async () => {
    render(
      <ClassifyToFlowRowDialog
        open
        onOpenChange={() => {}}
        tx={{ id: "tx-fin", description: "Andrea Zambra", amount: -688_986 }}
        flowRows={FLOW_ROWS}
      />,
    );

    fireEvent.click(screen.getByTestId("classify-flow-row-select"));
    fireEvent.click(screen.getByTestId("flow-row-option-row-finiquito"));

    await waitFor(() => {
      const label = screen.getByTestId("classify-flow-row-selected-label");
      expect(label.textContent).toContain("Finiquitos");
      expect(label.textContent).not.toContain("Aporte socios");
    });
  });
});
