import { describe, it, expect } from "vitest";
import {
  getRealBankBalanceAt,
  includeBankTxInLedger,
  type BalanceSnapshot,
  type BalanceTx,
} from "../real-balance.helper";

const accountIds = ["acc-1"];

function openingsOf(...entries: BalanceSnapshot[]) {
  return new Map([["acc-1", entries]]);
}
function txsOf(...entries: BalanceTx[]) {
  return new Map([["acc-1", entries]]);
}

describe("getRealBankBalanceAt (libro mayor por bucket)", () => {
  it("saldo inicial sin tx → exactamente opening.balance", () => {
    const openings = openingsOf({ asOfDate: new Date("2026-05-12"), balance: 20_967_579 });
    expect(
      getRealBankBalanceAt(new Date("2026-05-13"), accountIds, openings, new Map()),
    ).toBe(20_967_579);
  });

  it("saldo inicial + tx posteriores → suma correcta", () => {
    const openings = openingsOf({ asOfDate: new Date("2026-04-20"), balance: 10_000_000 });
    const txs = txsOf(
      { transactionDate: new Date("2026-04-26"), amount: 30_247_881 },
      { transactionDate: new Date("2026-05-03"), amount: -27_491 },
      { transactionDate: new Date("2026-05-10"), amount: -3_449_478 },
    );
    expect(getRealBankBalanceAt(new Date("2026-05-13"), accountIds, openings, txs)).toBe(
      10_000_000 + 30_247_881 - 27_491 - 3_449_478,
    );
  });

  it("bucket pasado: solo suma las tx hasta esa fecha (absoluto, no acumulativo)", () => {
    const openings = openingsOf({ asOfDate: new Date("2026-04-20"), balance: 10_000_000 });
    const txs = txsOf(
      { transactionDate: new Date("2026-04-26"), amount: 30_000_000 },
      { transactionDate: new Date("2026-05-10"), amount: -1_000_000 },
    );
    expect(getRealBankBalanceAt(new Date("2026-05-02"), accountIds, openings, txs)).toBe(
      40_000_000,
    );
    expect(getRealBankBalanceAt(new Date("2026-05-13"), accountIds, openings, txs)).toBe(
      39_000_000,
    );
  });

  it("cuenta sin saldo inicial no contribuye al consolidado", () => {
    const openings = new Map<string, BalanceSnapshot[]>([
      ["acc-1", [{ asOfDate: new Date("2026-04-20"), balance: 5_000_000 }]],
    ]);
    expect(
      getRealBankBalanceAt(new Date("2026-05-13"), ["acc-1", "acc-2-sin-opening"], openings, new Map()),
    ).toBe(5_000_000);
  });

  it("tenant sin saldos iniciales → null", () => {
    expect(getRealBankBalanceAt(new Date("2026-05-13"), accountIds, new Map(), new Map())).toBeNull();
  });

  it("bucket anterior al saldo inicial → la cuenta no aporta (null si es la única)", () => {
    const openings = openingsOf({ asOfDate: new Date("2026-05-13"), balance: 100 });
    expect(getRealBankBalanceAt(new Date("2026-05-02"), accountIds, openings, new Map())).toBeNull();
  });

  it("multi-cuenta: consolida con saldo inicial independiente", () => {
    const openings = new Map<string, BalanceSnapshot[]>([
      ["acc-1", [{ asOfDate: new Date("2026-05-01"), balance: 1_000_000 }]],
      ["acc-2", [{ asOfDate: new Date("2026-05-05"), balance: 500_000 }]],
    ]);
    const txs = new Map<string, BalanceTx[]>([
      ["acc-1", [{ transactionDate: new Date("2026-05-10"), amount: 200_000 }]],
      ["acc-2", [{ transactionDate: new Date("2026-05-11"), amount: -50_000 }]],
    ]);
    expect(
      getRealBankBalanceAt(new Date("2026-05-13"), ["acc-1", "acc-2"], openings, txs),
    ).toBe(1_000_000 + 200_000 + 500_000 - 50_000);
  });

  it("tx del mismo día del saldo inicial no se cuenta (ya está dentro del saldo de cierre)", () => {
    const openings = openingsOf({ asOfDate: new Date("2026-05-01"), balance: 100_000 });
    const txs = txsOf({ transactionDate: new Date("2026-05-01"), amount: 999_999 });
    expect(getRealBankBalanceAt(new Date("2026-05-13"), accountIds, openings, txs)).toBe(100_000);
  });

  it("tx del día siguiente al saldo inicial sí cuenta", () => {
    const openings = openingsOf({ asOfDate: new Date("2026-08-23"), balance: 24_773_797 });
    const txs = txsOf({ transactionDate: new Date("2026-08-24"), amount: 2_155_188 });
    expect(getRealBankBalanceAt(new Date("2026-08-25"), accountIds, openings, txs)).toBe(26_928_985);
  });

  it("tx exactamente en atDate sí se cuenta (uso de <=)", () => {
    const openings = openingsOf({ asOfDate: new Date("2026-04-30"), balance: 100_000 });
    const txs = txsOf({ transactionDate: new Date("2026-05-13"), amount: 50_000 });
    expect(getRealBankBalanceAt(new Date("2026-05-13"), accountIds, openings, txs)).toBe(150_000);
  });
});

describe("includeBankTxInLedger", () => {
  const openingDate = new Date("2026-08-24T00:00:00.000Z");
  const asOf = new Date("2026-08-25T00:00:00.000Z");
  it("excluye el día del saldo inicial y lo anterior", () => {
    expect(includeBankTxInLedger({ transactionDate: openingDate, openingAsOfDate: openingDate, asOfDate: asOf })).toBe(false);
    expect(includeBankTxInLedger({ transactionDate: new Date("2026-08-23T00:00:00.000Z"), openingAsOfDate: openingDate, asOfDate: asOf })).toBe(false);
  });
  it("incluye posteriores hasta el corte inclusive", () => {
    expect(includeBankTxInLedger({ transactionDate: asOf, openingAsOfDate: openingDate, asOfDate: asOf })).toBe(true);
    expect(includeBankTxInLedger({ transactionDate: new Date("2026-08-26T00:00:00.000Z"), openingAsOfDate: openingDate, asOfDate: asOf })).toBe(false);
  });
});
