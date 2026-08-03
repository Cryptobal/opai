import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/modules/finance/cashflow/weekly-close.service", () => ({
  persistWeeklyClose: vi.fn(),
  reopenWeeklyClose: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeCashflowConfig: { findUnique: vi.fn() },
    financeCashflowWeeklyClose: { findFirst: vi.fn(), findMany: vi.fn() },
    financeBankAccount: { findMany: vi.fn() },
    financeBankAccountBalance: { findFirst: vi.fn() },
    financeBankTransaction: { count: vi.fn() },
    financeCashflowOccurrence: { count: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { persistWeeklyClose } from "@/modules/finance/cashflow/weekly-close.service";
import {
  getV3WeeklyCloseSnapshotLite,
  listClosedV3Weeks,
  persistV3WeeklyClose,
} from "../weekly-close.adapter";

const asMock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const TENANT = "t1";

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.financeCashflowConfig.findUnique).mockResolvedValue({ weekClosingDow: 5 });
  asMock(prisma.financeBankAccount.findMany).mockResolvedValue([{ id: "a1", currentBalance: 1000 }]);
  asMock(prisma.financeBankAccountBalance.findFirst).mockResolvedValue(null);
  asMock(prisma.financeBankTransaction.count).mockResolvedValue(0);
  asMock(prisma.financeCashflowOccurrence.count).mockResolvedValue(0);
  asMock(prisma.financeCashflowWeeklyClose.findFirst).mockResolvedValue(null);
});

describe("listClosedV3Weeks — mapeo semana ISO ↔ semana de cierre v2", () => {
  it("mapea el lunes ISO a su día de cierre v2 (viernes) y detecta el sello", async () => {
    asMock(prisma.financeCashflowWeeklyClose.findMany).mockResolvedValue([
      { weekEndDate: new Date("2026-07-24T00:00:00.000Z") },
    ]);
    const closed = await listClosedV3Weeks(TENANT, ["2026-07-20", "2026-07-27"]);
    expect(closed).toEqual(["2026-07-20"]);
  });

  it("semana sin cierre coincidente no se marca", async () => {
    asMock(prisma.financeCashflowWeeklyClose.findMany).mockResolvedValue([
      { weekEndDate: new Date("2026-08-07T00:00:00.000Z") },
    ]);
    const closed = await listClosedV3Weeks(TENANT, ["2026-07-20"]);
    expect(closed).toEqual([]);
  });
});

describe("getV3WeeklyCloseSnapshotLite — sin proyección", () => {
  it("resuelve banco + counts y deja projected/variance en 0", async () => {
    asMock(prisma.financeBankAccount.findMany).mockResolvedValue([
      { id: "a1", currentBalance: 5_000 },
    ]);
    asMock(prisma.financeBankTransaction.count).mockResolvedValue(3);
    asMock(prisma.financeCashflowOccurrence.count).mockResolvedValue(2);
    // Semana pasada conocida: 2020-07-06 es lunes.
    const snap = await getV3WeeklyCloseSnapshotLite(TENANT, "2020-07-06");
    expect(snap.bankBalanceClp).toBe(5000);
    expect(snap.projectedBalanceClp).toBe(0);
    expect(snap.varianceClp).toBe(0);
    expect(snap.unassignedBankCount).toBe(3);
    expect(snap.unfulfilledProjCount).toBe(2);
    expect(snap.weekStartYmd).toBe("2020-07-06");
  });
});

describe("persistV3WeeklyClose — real vs manual y guardas", () => {
  it("saldo = banco ⇒ cierre real (sin motivo)", async () => {
    asMock(prisma.financeCashflowWeeklyClose.findFirst).mockResolvedValue(null);
    asMock(persistWeeklyClose).mockResolvedValue({});
    const r = await persistV3WeeklyClose(TENANT, "u", { anyDayYmd: "2020-07-06", closedBalance: 1000 });
    expect(r.isManual).toBe(false);
    expect(asMock(persistWeeklyClose).mock.calls[0][2]).toMatchObject({ mode: "real", anchor: false });
  });

  it("saldo distinto del banco sin motivo ⇒ rechaza", async () => {
    asMock(prisma.financeCashflowWeeklyClose.findFirst).mockResolvedValue(null);
    await expect(
      persistV3WeeklyClose(TENANT, "u", { anyDayYmd: "2020-07-06", closedBalance: 2000 }),
    ).rejects.toThrow(/manualReason/);
  });

  it("saldo distinto con motivo ⇒ cierre manual con forcedBalanceClp", async () => {
    asMock(prisma.financeCashflowWeeklyClose.findFirst).mockResolvedValue(null);
    asMock(persistWeeklyClose).mockResolvedValue({});
    const r = await persistV3WeeklyClose(TENANT, "u", {
      anyDayYmd: "2020-07-06", closedBalance: 2000, manualReason: "cheque en tránsito",
    });
    expect(r.isManual).toBe(true);
    expect(asMock(persistWeeklyClose).mock.calls[0][2]).toMatchObject({
      mode: "manual", forcedBalanceClp: 2000, manualReason: "cheque en tránsito",
    });
  });

  it("rechaza cerrar una semana futura", async () => {
    await expect(
      persistV3WeeklyClose(TENANT, "u", { anyDayYmd: "2099-06-15", closedBalance: 0 }),
    ).rejects.toThrow(/futura/);
  });
});
