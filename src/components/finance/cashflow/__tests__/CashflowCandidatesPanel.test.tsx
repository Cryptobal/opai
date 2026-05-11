import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CashflowCandidatesPanel } from "../CashflowCandidatesPanel";

global.fetch = vi.fn();

beforeEach(() => {
  (global.fetch as ReturnType<typeof vi.fn>).mockReset();
});

describe("CashflowCandidatesPanel", () => {
  it("muestra loading inicialmente", () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}));
    render(<CashflowCandidatesPanel bankTransactionId="tx-1" onMatched={() => {}} />);
    expect(screen.getByText(/buscando candidatos/i)).toBeInTheDocument();
  });

  it("muestra empty state si no hay candidatos", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    render(<CashflowCandidatesPanel bankTransactionId="tx-1" onMatched={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/no se encontraron/i)).toBeInTheDocument();
    });
  });

  it("renderiza candidato con su nombre y monto", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      json: () =>
        Promise.resolve({
          success: true,
          data: [
            {
              occurrenceId: "occ-1",
              itemId: "item-1",
              itemName: "Telefonía Entel",
              installationName: null,
              categoryCode: "EGR_TELEFONIA",
              categoryName: "Telefonía",
              kind: "EXPENSE",
              projectedDate: "2026-05-08T00:00:00.000Z",
              projectedAmountClp: 250000,
              bankAmountClp: 300000,
              varianceClp: 50000,
              daysDelta: 3,
              confidence: 92,
              matchReason: "ACCOUNT_MAPPED",
            },
          ],
        }),
    });
    render(<CashflowCandidatesPanel bankTransactionId="tx-1" onMatched={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/telefonía entel/i)).toBeInTheDocument();
      expect(screen.getByText(/mejor match/i)).toBeInTheDocument();
    });
  });
});
