import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { BucketBankDrawer } from "../BucketBankDrawer";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("BucketBankDrawer", () => {
  it("no fetcheo cuando está cerrado", () => {
    render(
      <BucketBankDrawer
        open={false}
        onOpenChange={() => {}}
        bucketKey="2026-W19"
        granularity="weekly"
      />,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetchea con bucketKey y granularity al abrirse", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          bucketKey: "2026-W19",
          start: "2026-05-04",
          end: "2026-05-10",
          transactions: [],
        },
      }),
    });
    render(
      <BucketBankDrawer
        open={true}
        onOpenChange={() => {}}
        bucketKey="2026-W19"
        granularity="weekly"
      />,
    );
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/finance/cashflow/bucket-bank?key=2026-W19&granularity=weekly",
      );
    });
  });

  it("renderiza lista vacía cuando no hay transacciones", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          bucketKey: "2026-W19",
          start: "2026-05-04",
          end: "2026-05-10",
          transactions: [],
        },
      }),
    });
    render(
      <BucketBankDrawer
        open={true}
        onOpenChange={() => {}}
        bucketKey="2026-W19"
        granularity="weekly"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/No hay movimientos/)).toBeTruthy();
    });
  });

  it("renderiza créditos y débitos con formato CLP", async () => {
    fetchMock.mockResolvedValue({
      json: async () => ({
        success: true,
        data: {
          bucketKey: "2026-W19",
          start: "2026-05-04",
          end: "2026-05-10",
          transactions: [
            {
              id: "tx-1",
              date: "2026-05-05",
              description: "Transferencia recibida",
              amount: 500_000,
              reconciliationStatus: "UNMATCHED",
              bankAccountName: "Banco X",
            },
            {
              id: "tx-2",
              date: "2026-05-06",
              description: "Pago proveedor",
              amount: -200_000,
              reconciliationStatus: "MATCHED",
              bankAccountName: "Banco X",
            },
          ],
        },
      }),
    });
    render(
      <BucketBankDrawer
        open={true}
        onOpenChange={() => {}}
        bucketKey="2026-W19"
        granularity="weekly"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Transferencia recibida")).toBeTruthy();
      expect(screen.getByText("Pago proveedor")).toBeTruthy();
      // Total créditos
      expect(screen.getByText("500.000")).toBeTruthy();
    });
  });
});
