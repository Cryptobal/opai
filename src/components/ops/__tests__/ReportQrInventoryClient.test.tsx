import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { confirmDialog } from "@/components/ui/confirm-service";
import { ReportQrInventoryClient } from "../ReportQrInventoryClient";

vi.mock("@/components/ui/confirm-service", () => ({
  confirmDialog: vi.fn(async () => true),
}));

const LOTE_LIBRE = {
  id: "lote-1",
  code: "L-202608-001",
  quantity: 2,
  note: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  counts: { unassigned: 1, assigned: 0, retired: 1 },
};
const LOTE_ASIGNADO = {
  id: "lote-2",
  code: "L-ASIG",
  quantity: 1,
  note: null,
  createdAt: "2026-08-02T00:00:00.000Z",
  counts: { unassigned: 0, assigned: 1, retired: 0 },
};

const ITEMS = [
  {
    id: "qr-1",
    serialLabel: "QR-00001",
    status: "unassigned",
    assignedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    loteId: "lote-1",
    loteCode: "L-202608-001",
    installationId: null,
    installationName: null,
  },
  {
    id: "qr-2",
    serialLabel: "QR-00002",
    status: "assigned",
    assignedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    loteId: "lote-2",
    loteCode: "L-ASIG",
    installationId: "inst-1",
    installationName: "Sede Centro",
  },
  {
    id: "qr-3",
    serialLabel: "QR-00003",
    status: "retired",
    assignedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    loteId: "lote-1",
    loteCode: "L-202608-001",
    installationId: null,
    installationName: null,
  },
];

function loteRow(code: string) {
  const match = screen.getAllByText(code).find((node) => node.closest("li")?.textContent?.includes("PDF adhesivos"));
  const li = match?.closest("li");
  if (!li) throw new Error(`No se encontró la fila de lote ${code}`);
  return li;
}

function jsonOk(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: async () => ({ success: true, data }),
  });
}

describe("ReportQrInventoryClient — eliminar", () => {
  beforeEach(() => {
    vi.mocked(confirmDialog).mockClear();
    vi.mocked(confirmDialog).mockResolvedValue(true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (method === "DELETE") {
          return jsonOk({ ok: true });
        }
        if (url === "/api/ops/report-qrs/lotes" || url.endsWith("/api/ops/report-qrs/lotes")) {
          return jsonOk([LOTE_LIBRE, LOTE_ASIGNADO]);
        }
        if (url.includes("/api/ops/report-qrs?")) {
          return jsonOk({
            counts: { unassigned: 1, assigned: 1, retired: 1, total: 3 },
            items: ITEMS,
          });
        }
        return jsonOk([]);
      }),
    );
  });

  it("muestra Eliminar en lotes libres y lo deshabilita si hay QR asignados", async () => {
    render(<ReportQrInventoryClient canEdit />);
    await waitFor(() => {
      expect(screen.getAllByText("L-202608-001").length).toBeGreaterThan(0);
    });

    expect(within(loteRow("L-202608-001")).getByRole("button", { name: /Eliminar/ })).toBeEnabled();
    expect(within(loteRow("L-ASIG")).getByRole("button", { name: /Eliminar/ })).toBeDisabled();
  });

  it("elimina un lote libre y un QR sin asignar", async () => {
    render(<ReportQrInventoryClient canEdit />);
    await waitFor(() => {
      expect(screen.getAllByText("L-202608-001").length).toBeGreaterThan(0);
    });

    fireEvent.click(within(loteRow("L-202608-001")).getByRole("button", { name: /Eliminar/ }));
    expect(confirmDialog).toHaveBeenCalled();

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).includes("/api/ops/report-qrs/lotes/lote-1") && init?.method === "DELETE",
        ),
      ).toBe(true);
    });

    const qrRow = screen.getAllByText("QR-00001")[0]?.closest("li") ?? screen.getAllByText("QR-00001")[0]?.closest("tr");
    expect(qrRow).toBeTruthy();
    fireEvent.click(within(qrRow as HTMLElement).getByRole("button", { name: /Eliminar/ }));
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).includes("/api/ops/report-qrs/qr-1") && init?.method === "DELETE",
        ),
      ).toBe(true);
    });
  });

  it("no ofrece Eliminar en un QR asignado", async () => {
    render(<ReportQrInventoryClient canEdit />);
    await waitFor(() => {
      expect(screen.getAllByText("QR-00002").length).toBeGreaterThan(0);
    });
    const assignedNodes = screen.getAllByText("QR-00002");
    for (const node of assignedNodes) {
      const row = node.closest("li") ?? node.closest("tr");
      if (!row) continue;
      expect(within(row).queryByRole("button", { name: /Eliminar/ })).toBeNull();
    }
  });
});
