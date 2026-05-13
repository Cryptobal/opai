import { describe, it, expect } from "vitest";
import {
  getRealBankBalanceAt,
  type BalanceSnapshot,
  type BalanceTx,
} from "../real-balance.helper";

const accountIds = ["acc-1"];

function snapsOf(...entries: BalanceSnapshot[]) {
  return new Map([["acc-1", entries]]);
}
function txsOf(...entries: BalanceTx[]) {
  return new Map([["acc-1", entries]]);
}

describe("getRealBankBalanceAt", () => {
  it("snapshot MANUAL hoy, sin tx → devuelve exactamente snapshot.balance", () => {
    const today = new Date("2026-05-13");
    const snaps = snapsOf({ asOfDate: new Date("2026-05-13"), balance: 20_967_579 });
    const txs = new Map<string, BalanceTx[]>();
    expect(getRealBankBalanceAt(today, accountIds, snaps, txs)).toBe(20_967_579);
  });

  it("snapshot histórico + tx posteriores → suma correcta", () => {
    const snaps = snapsOf({ asOfDate: new Date("2026-04-20"), balance: 10_000_000 });
    const txs = txsOf(
      { transactionDate: new Date("2026-04-26"), amount: 30_247_881 },
      { transactionDate: new Date("2026-05-03"), amount: -27_491 },
      { transactionDate: new Date("2026-05-10"), amount: -3_449_478 },
    );
    const result = getRealBankBalanceAt(
      new Date("2026-05-13"),
      accountIds,
      snaps,
      txs,
    );
    expect(result).toBe(10_000_000 + 30_247_881 - 27_491 - 3_449_478);
  });

  it("snapshot manual de hoy gana sobre cartola vieja, para bucket actual", () => {
    const snaps = snapsOf(
      { asOfDate: new Date("2026-04-20"), balance: 10_000_000 },
      { asOfDate: new Date("2026-05-13"), balance: 20_967_579 },
    );
    const txs = txsOf(
      { transactionDate: new Date("2026-04-26"), amount: 30_000_000 },
      { transactionDate: new Date("2026-05-10"), amount: -1_000_000 },
    );
    expect(
      getRealBankBalanceAt(new Date("2026-05-13"), accountIds, snaps, txs),
    ).toBe(20_967_579);
  });

  it("bucket pasado al snapshot manual usa el snapshot ANTERIOR (cartola)", () => {
    const snaps = snapsOf(
      { asOfDate: new Date("2026-04-20"), balance: 10_000_000 },
      { asOfDate: new Date("2026-05-13"), balance: 20_967_579 },
    );
    const txs = txsOf(
      { transactionDate: new Date("2026-04-26"), amount: 30_000_000 },
      { transactionDate: new Date("2026-05-10"), amount: -1_000_000 },
    );
    expect(
      getRealBankBalanceAt(new Date("2026-05-02"), accountIds, snaps, txs),
    ).toBe(10_000_000 + 30_000_000);
  });

  it("cuenta sin snapshot no contribuye al consolidado", () => {
    const snaps = new Map<string, BalanceSnapshot[]>([
      ["acc-1", [{ asOfDate: new Date("2026-04-20"), balance: 5_000_000 }]],
    ]);
    const txs = new Map<string, BalanceTx[]>();
    const result = getRealBankBalanceAt(
      new Date("2026-05-13"),
      ["acc-1", "acc-2-sin-snapshot"],
      snaps,
      txs,
    );
    expect(result).toBe(5_000_000);
  });

  it("tenant sin snapshots → null", () => {
    expect(
      getRealBankBalanceAt(
        new Date("2026-05-13"),
        accountIds,
        new Map(),
        new Map(),
      ),
    ).toBeNull();
  });

  it("multi-cuenta: consolida saldos de varias cuentas con anchor independiente", () => {
    const snaps = new Map<string, BalanceSnapshot[]>([
      ["acc-1", [{ asOfDate: new Date("2026-05-01"), balance: 1_000_000 }]],
      ["acc-2", [{ asOfDate: new Date("2026-05-05"), balance: 500_000 }]],
    ]);
    const txs = new Map<string, BalanceTx[]>([
      ["acc-1", [{ transactionDate: new Date("2026-05-10"), amount: 200_000 }]],
      ["acc-2", [{ transactionDate: new Date("2026-05-11"), amount: -50_000 }]],
    ]);
    expect(
      getRealBankBalanceAt(
        new Date("2026-05-13"),
        ["acc-1", "acc-2"],
        snaps,
        txs,
      ),
    ).toBe(1_000_000 + 200_000 + 500_000 - 50_000);
  });

  it("tx exactamente en la fecha del snapshot no se cuenta (uso de >, no >=)", () => {
    const snaps = snapsOf({ asOfDate: new Date("2026-05-01"), balance: 100_000 });
    const txs = txsOf({ transactionDate: new Date("2026-05-01"), amount: 999_999 });
    expect(
      getRealBankBalanceAt(new Date("2026-05-13"), accountIds, snaps, txs),
    ).toBe(100_000);
  });

  it("tx exactamente en atDate sí se cuenta (uso de <=)", () => {
    const snaps = snapsOf({ asOfDate: new Date("2026-04-30"), balance: 100_000 });
    const txs = txsOf({ transactionDate: new Date("2026-05-13"), amount: 50_000 });
    expect(
      getRealBankBalanceAt(new Date("2026-05-13"), accountIds, snaps, txs),
    ).toBe(150_000);
  });
});
