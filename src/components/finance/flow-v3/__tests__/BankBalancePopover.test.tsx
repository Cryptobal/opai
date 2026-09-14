/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BankBalancePopover } from "../BankBalancePopover";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const detail = {
  totalClp: 42_442_544,
  lastSnapshotYmd: "2026-08-10",
  discrepancyThresholdClp: 100_000,
  perAccount: [
    {
      bankName: "Santander",
      accountMasked: "••4115",
      balanceClp: 42_442_544,
      lastSnapshotYmd: "2026-08-10",
      anchorSource: "OPENING" as const,
      anchorBalanceClp: 40_000_000,
      txDeltaClp: 2_442_544,
      txCount: 12,
      needsOpening: false,
      lastDiscrepancy: null,
    },
  ],
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("BankBalancePopover", () => {
  it("solo lectura sin canManage", () => {
    render(
      <BankBalancePopover
        open
        onOpenChange={() => {}}
        detail={detail}
        todayYmd="2026-08-12"
      />,
    );
    expect(screen.getByText("Saldo del banco hoy")).toBeTruthy();
    expect(screen.queryByText("Registrar lectura")).toBeNull();
    expect(screen.getAllByText("$42.442.544").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Total en FC")).toBeTruthy();
    expect(screen.getByText(/Saldo inicial/)).toBeTruthy();
    expect(screen.getByText(/12 mov\./)).toBeTruthy();
  });

  it("cuenta sin saldo inicial muestra el aviso", () => {
    render(
      <BankBalancePopover
        open
        onOpenChange={() => {}}
        detail={{
          ...detail,
          perAccount: [
            { ...detail.perAccount[0]!, anchorSource: null, needsOpening: true },
          ],
        }}
        todayYmd="2026-08-12"
      />,
    );
    expect(screen.getByText(/Sin saldo inicial/)).toBeTruthy();
  });

  it("muestra badge de última diferencia no explicada", () => {
    render(
      <BankBalancePopover
        open
        onOpenChange={() => {}}
        detail={{
          ...detail,
          perAccount: [
            {
              ...detail.perAccount[0]!,
              lastDiscrepancy: { asOfYmd: "2026-09-09", deltaClp: 7_770_000 },
            },
          ],
        }}
        todayYmd="2026-09-09"
      />,
    );
    expect(screen.getByText(/Última diferencia no explicada/)).toBeTruthy();
    expect(screen.getByText(/09\/09\/26/)).toBeTruthy();
  });

  it("con canManage registra la lectura (adjust) y llama onSaved", async () => {
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/bank-balance/pull")) {
          return new Response(
            JSON.stringify({
              success: true,
              data: [
                {
                  bankAccountId: "11111111-1111-4111-8111-111111111111",
                  bankName: "Santander",
                  accountNumber: "0-000-9454115-8",
                  currentBalance: 42_442_544,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/bank-balance/adjust")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            balance: number;
            note?: string;
          };
          expect(body.balance).toBe(39_672_512);
          expect(body.note).toMatch(/Office Banking/);
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                snapshotId: "s1",
                balance: 42_442_544,
                readingBalance: body.balance,
                asOfDate: "2026-08-12",
                discrepancy: { delta: body.balance - 42_442_544, evaluable: true },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`fetch no mockeado: ${url}`);
      }),
    );

    render(
      <BankBalancePopover
        open
        onOpenChange={onOpenChange}
        detail={detail}
        todayYmd="2026-08-12"
        canManage
        onSaved={onSaved}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Cuadrar saldo banco")).toBeTruthy();
    });

    const input = await screen.findByLabelText("Saldo real a hoy");
    fireEvent.change(input, { target: { value: "39672512" } });
    const note = screen.getByLabelText(/Nota \(obligatoria\)/);
    fireEvent.change(note, { target: { value: "App Office Banking 12:51" } });

    fireEvent.click(screen.getByRole("button", { name: "Registrar lectura" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
