/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BankBalancePopover } from "../BankBalancePopover";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const detail = {
  totalClp: 42_442_544,
  lastSnapshotYmd: "2026-08-10",
  perAccount: [
    {
      bankName: "Santander",
      accountMasked: "••4115",
      balanceClp: 42_442_544,
      lastSnapshotYmd: "2026-08-10",
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
    expect(screen.queryByText("Anclar y recalcular")).toBeNull();
    expect(screen.getAllByText("$42.442.544").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Total en FC")).toBeTruthy();
  });

  it("con canManage permite anclar saldo y llama adjust + onSaved", async () => {
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
              data: { snapshotId: "s1", balance: body.balance, asOfDate: "2026-08-12" },
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
      expect(screen.getByText("Actualizar saldo banco")).toBeTruthy();
    });

    const input = await screen.findByLabelText("Saldo real a hoy");
    fireEvent.change(input, { target: { value: "39672512" } });
    const note = screen.getByLabelText("Nota (opcional)");
    fireEvent.change(note, { target: { value: "App Office Banking 12:51" } });

    fireEvent.click(screen.getByRole("button", { name: "Anclar y recalcular" }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
