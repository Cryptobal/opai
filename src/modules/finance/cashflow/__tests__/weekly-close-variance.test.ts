import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Regresión de la varianza del cierre semanal (Bug A).
 *
 * `computeWeeklyCloseSnapshot` usaba `proj.openingBalanceClp` como saldo de
 * apertura, pero ese valor es el saldo del banco HOY (resolveOpeningBalance se
 * invoca sin asOfDate en projection.service), no el saldo al abrir la semana que
 * se está cerrando. Al cerrar una semana pasada la varianza salía desplazada por
 * todos los movimientos ocurridos entre medio.
 *
 * Ahora el snapshot calcula el saldo banco a dos cortes (apertura = día previo al
 * weekStart, cierre = weekEnd) y la varianza es banco_fin − (banco_inicio + ing −
 * egr). Estos tests fijan ese contrato; el #1 falla contra el código previo.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankAccount: { findMany: vi.fn() },
    financeBankAccountBalance: { findFirst: vi.fn() },
    financeBankTransaction: { findMany: vi.fn() },
    financeCashflowOccurrence: { findMany: vi.fn() },
    crmInstallation: { findMany: vi.fn() },
  },
}));

vi.mock("../config.service", () => ({
  getOrCreateCashflowConfig: vi.fn(async () => ({ weekClosingDow: 5 })),
}));

vi.mock("../projection.service", () => ({
  buildProjection: vi.fn(),
}));

vi.mock("../candidate-finder", () => ({
  findCashflowOccurrenceCandidates: vi.fn(async () => []),
}));

import { prisma } from "@/lib/prisma";
import { buildProjection } from "../projection.service";
import { computeWeeklyCloseSnapshot } from "../weekly-close.service";

const accountFindMany = prisma.financeBankAccount.findMany as unknown as ReturnType<typeof vi.fn>;
const balanceFindFirst = prisma.financeBankAccountBalance.findFirst as unknown as ReturnType<typeof vi.fn>;
const txFindMany = prisma.financeBankTransaction.findMany as unknown as ReturnType<typeof vi.fn>;
const occFindMany = prisma.financeCashflowOccurrence.findMany as unknown as ReturnType<typeof vi.fn>;
const buildProjectionMock = buildProjection as unknown as ReturnType<typeof vi.fn>;

/** Saldo del banco HOY (lo que retorna resolveOpeningBalance sin asOfDate y que
 *  el código previo usaba como apertura). Muy distinto del saldo al abrir una
 *  semana pasada — ese contraste es el corazón del bug. */
const SALDO_HOY = 50_000_000;

/**
 * Configura los mocks para un cierre. `openBalance` = snapshot banco al abrir la
 * semana (asOf = weekStart−1); `closeBalance` = snapshot banco al cerrar (asOf =
 * weekEnd). La diferenciación se hace por la fecha de corte de cada query.
 */
function setupScenario(opts: {
  openBalance: number;
  closeBalance: number;
  totalIncome: number;
  totalExpense: number;
  /** Umbral: cortes ≥ esta fecha son "cierre", el resto "apertura". */
  splitDate: Date;
}) {
  accountFindMany.mockResolvedValue([{ id: "acc-1", currentBalance: 0 }]);
  balanceFindFirst.mockImplementation(async (args: { where: { asOfDate: { lte: Date } } }) => {
    const lte = args.where.asOfDate.lte;
    const isClose = lte.getTime() >= opts.splitDate.getTime();
    return { balance: isClose ? opts.closeBalance : opts.openBalance };
  });
  txFindMany.mockResolvedValue([]);
  occFindMany.mockResolvedValue([]);
  buildProjectionMock.mockResolvedValue({
    openingBalanceClp: SALDO_HOY,
    totals: { totalIncome: opts.totalIncome, totalExpense: opts.totalExpense },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computeWeeklyCloseSnapshot · varianza", () => {
  // Semana pasada (cierre viernes 2026-05-15 → apertura sábado 2026-05-09).
  const pastWeekEnd = new Date("2026-05-15T10:00:00Z");

  it("semana pasada que cuadra perfecto → varianza 0 (falla contra el código previo)", async () => {
    // Banco abrió en 30M, cerró en 34M; ingresos 10M − egresos 6M = +4M ⇒ cuadra.
    setupScenario({
      openBalance: 30_000_000,
      closeBalance: 34_000_000,
      totalIncome: 10_000_000,
      totalExpense: 6_000_000,
      splitDate: new Date("2026-05-12"),
    });

    const snap = await computeWeeklyCloseSnapshot("t1", pastWeekEnd);

    // Con el fix: 34M − (30M + 10M − 6M) = 0.
    // Con el código previo usaba SALDO_HOY (50M) como apertura →
    // 34M − (50M + 10M − 6M) = −20M. Este assert falla antes del fix.
    expect(snap.varianceClp).toBe(0);
  });

  it("semana con un egreso real no proyectado → varianza = exactamente −ese monto", async () => {
    // Igual que arriba pero el banco cerró 2M abajo (egreso real no proyectado).
    setupScenario({
      openBalance: 30_000_000,
      closeBalance: 32_000_000,
      totalIncome: 10_000_000,
      totalExpense: 6_000_000,
      splitDate: new Date("2026-05-12"),
    });

    const snap = await computeWeeklyCloseSnapshot("t1", pastWeekEnd);

    // 32M − (30M + 10M − 6M) = −2M, exactamente el egreso faltante.
    expect(snap.varianceClp).toBe(-2_000_000);
  });

  it("cerrar la semana en curso que cuadra sigue dando varianza 0 (no-regresión)", async () => {
    // Semana en curso: cierre viernes 2026-07-17 (hoy 2026-07-13).
    const currentWeekEnd = new Date("2026-07-17T10:00:00Z");
    setupScenario({
      openBalance: 48_000_000,
      closeBalance: 50_000_000,
      totalIncome: 5_000_000,
      totalExpense: 3_000_000,
      splitDate: new Date("2026-07-14"),
    });

    const snap = await computeWeeklyCloseSnapshot("t1", currentWeekEnd);

    // 50M − (48M + 5M − 3M) = 0.
    expect(snap.varianceClp).toBe(0);
  });

  it("openingBalanceClp se expone y ≠ al saldo de hoy (proj.openingBalanceClp) en semanas pasadas", async () => {
    setupScenario({
      openBalance: 30_000_000,
      closeBalance: 34_000_000,
      totalIncome: 10_000_000,
      totalExpense: 6_000_000,
      splitDate: new Date("2026-05-12"),
    });

    const snap = await computeWeeklyCloseSnapshot("t1", pastWeekEnd);

    // La apertura es el saldo real al abrir la semana (30M), no el saldo de hoy.
    expect(snap.openingBalanceClp).toBe(30_000_000);
    expect(snap.openingBalanceClp).not.toBe(SALDO_HOY);
  });
});
