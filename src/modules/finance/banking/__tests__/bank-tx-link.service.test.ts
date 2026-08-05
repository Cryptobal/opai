import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeBankTransaction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    financeFactoringCompany: { findMany: vi.fn() },
    financeFactoringOperation: { findMany: vi.fn() },
    financeFactoringBatch: { findMany: vi.fn() },
    financeDte: { findMany: vi.fn() },
    financeBankTransactionLink: { findMany: vi.fn() },
    crmInstallation: { findMany: vi.fn() },
  },
}));

vi.mock("../../accounting/journal-entry.service", () => ({
  createManualEntry: vi.fn(),
}));

vi.mock("../write-off.service", () => ({
  evaluateWriteOff: vi.fn(),
  applyAutoWriteOff: vi.fn(),
  resolveCounterpartyAccountId: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import {
  findFactoringCandidatesForBulk,
  findDteCandidatesForBulk,
  findFactoringBatches,
  searchReconcileCandidates,
  resolveBatchTotal,
  batchMatchesDeposit,
  BATCH_DEPOSIT_MATCH_TOLERANCE,
} from "../bank-tx-link.service";

type Fn = ReturnType<typeof vi.fn>;
const asMock = (fn: unknown) => fn as Fn;

const dec = (n: number | null) =>
  n == null ? null : { toNumber: () => n };

function makeOp(overrides: Record<string, unknown> = {}) {
  return {
    id: "op-1",
    code: "CES-001",
    factoringCompany: "SCF SERVICIOS F",
    factoringCompanyId: "co-scf",
    fechaCesion: new Date("2026-07-01"),
    fechaVencimiento: new Date("2026-08-01"),
    invoiceAmount: dec(21_143_306),
    simMontoAGirar: dec(21_143_306),
    netAdvance: dec(20_000_000),
    status: "FUNDED",
    batchId: null,
    batch: null,
    dte: {
      folio: 1773,
      receiverName: "Cliente X",
      installationId: null,
      paymentStatus: "CEDED",
      issuerName: "Gard",
      issuerRut: "11.111.111-1",
      receiverRut: "22.222.222-2",
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  asMock(prisma.crmInstallation.findMany).mockResolvedValue([]);
  asMock(prisma.financeBankTransactionLink.findMany).mockResolvedValue([]);
  asMock(prisma.financeFactoringCompany.findMany).mockResolvedValue([
    { id: "co-scf", rut: "11.111.111-1", razonSocial: "SCF SERVICIOS FINANCIEROS" },
    { id: "co-other", rut: "22.222.222-2", razonSocial: "OTRO FACTORING SA" },
  ]);
});

describe("resolveBatchTotal / batchMatchesDeposit", () => {
  it("cae a sum_sim cuando totalMontoAGirar es null", () => {
    const r = resolveBatchTotal({
      batchTotal: null,
      operations: [
        { simMontoAGirar: 10_000_000, netAdvance: 9_000_000 },
        { simMontoAGirar: 20_004_887, netAdvance: 19_000_000 },
      ],
    });
    expect(r.source).toBe("sum_sim");
    expect(r.total).toBe(30_004_887);
  });

  it("cae a sum_net cuando no hay sim", () => {
    const r = resolveBatchTotal({
      batchTotal: null,
      operations: [
        { simMontoAGirar: null, netAdvance: 5_000 },
        { simMontoAGirar: null, netAdvance: 3_000 },
      ],
    });
    expect(r.source).toBe("sum_net");
    expect(r.total).toBe(8_000);
  });

  it("tolerancia: $900 calza; 1% de 30M no calza", () => {
    const total = 30_000_000;
    expect(BATCH_DEPOSIT_MATCH_TOLERANCE(total)).toBe(150_000);
    expect(batchMatchesDeposit(total - 900, total)).toBe(true);
    expect(batchMatchesDeposit(total - 300_000, total)).toBe(false);
  });
});

describe("findFactoringCandidatesForBulk", () => {
  it("incluye cesión grande que solo calza con la suma del lote", async () => {
    const txs = [
      { id: "t1", amount: dec(7_000_000), transactionDate: new Date("2026-07-15"), description: "SCF SERVICIOS F", reference: null },
      { id: "t2", amount: dec(7_000_000), transactionDate: new Date("2026-07-15"), description: "SCF SERVICIOS F", reference: null },
      { id: "t3", amount: dec(7_000_000), transactionDate: new Date("2026-07-15"), description: "SCF SERVICIOS F", reference: null },
      { id: "t4", amount: dec(5_000_000), transactionDate: new Date("2026-07-15"), description: "SCF SERVICIOS F", reference: null },
      { id: "t5", amount: dec(4_004_887), transactionDate: new Date("2026-07-15"), description: "SCF SERVICIOS F", reference: null },
    ];
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue(txs);
    // per-tx findFirst calls inside findFactoringCandidates
    asMock(prisma.financeBankTransaction.findFirst).mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        txs.find((t) => t.id === where.id) ?? null,
    );

    const bigOp = makeOp({
      id: "op-big",
      simMontoAGirar: dec(30_004_887),
      invoiceAmount: dec(32_000_000),
      factoringCompanyId: "co-scf",
    });

    asMock(prisma.financeFactoringOperation.findMany).mockImplementation(
      async (args: { where: { factoringCompanyId?: string; OR?: unknown[] } }) => {
        // Rama A (company, sin banda) o rama B con banda amplia de totalAbs
        if (args.where.factoringCompanyId === "co-scf") {
          return [bigOp];
        }
        // Banda per-tx (~7M) no debería incluir bigOp; devolvemos vacío
        // salvo cuando la banda cubre ~30M (pasada contra total)
        const or = args.where.OR as Array<{ AND?: Array<{ OR?: Array<{ simMontoAGirar?: { gte: number; lte: number } }> }> }> | undefined;
        const band = or?.[0]?.AND?.find((x) => x.OR)?.OR?.[0]?.simMontoAGirar;
        if (band && band.gte <= 15_000_000 && band.lte >= 30_000_000) {
          return [bigOp];
        }
        return [];
      },
    );

    const result = await findFactoringCandidatesForBulk("tenant-a", [
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect(result.some((c) => c.id === "op-big")).toBe(true);
    expect(result.every((c) => true)).toBe(true); // sanity
  });

  it("prioriza cesión de empresa detectada fuera de banda sobre otra en banda", async () => {
    const txs = [
      {
        id: "t1",
        amount: dec(7_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "TRF SCF SERVICIOS",
        reference: null,
      },
      {
        id: "t2",
        amount: dec(7_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "TRF SCF SERVICIOS",
        reference: null,
      },
    ];
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue(txs);
    asMock(prisma.financeBankTransaction.findFirst).mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        txs.find((t) => t.id === where.id) ?? null,
    );

    const scfOutOfBand = makeOp({
      id: "op-scf",
      factoringCompanyId: "co-scf",
      factoringCompany: "SCF SERVICIOS F",
      simMontoAGirar: dec(21_143_306),
      invoiceAmount: dec(21_143_306),
    });
    const otherInBand = makeOp({
      id: "op-other",
      factoringCompanyId: "co-other",
      factoringCompany: "OTRO FACTORING SA",
      simMontoAGirar: dec(7_000_000),
      invoiceAmount: dec(7_200_000),
      dte: { folio: 999, receiverName: "Y", installationId: null },
    });

    asMock(prisma.financeFactoringOperation.findMany).mockImplementation(
      async (args: { where: { factoringCompanyId?: string } }) => {
        if (args.where.factoringCompanyId === "co-scf") return [scfOutOfBand];
        return [otherInBand];
      },
    );

    const result = await findFactoringCandidatesForBulk("tenant-a", [
      "t1",
      "t2",
    ]);
    expect(result.length).toBeGreaterThan(0);
    const scf = result.find((c) => c.id === "op-scf");
    const other = result.find((c) => c.id === "op-other");
    expect(scf).toBeTruthy();
    // Empresa detectada queda primero aunque su confidence de monto sea menor.
    expect(result[0]!.id).toBe("op-scf");
    if (scf && other) {
      expect(result.indexOf(scf)).toBeLessThan(result.indexOf(other));
    }
  });
});

describe("findDteCandidatesForBulk — excluye anuladas por NC", () => {
  it("el where de candidatos incluye voidedByCreditNoteId null y excluye NC/ND", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "t1",
        amount: dec(1_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "pago",
        reference: null,
      },
      {
        id: "t2",
        amount: dec(1_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "pago",
        reference: null,
      },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([]);

    await findDteCandidatesForBulk("tenant-a", ["t1", "t2"]);

    expect(prisma.financeDte.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "tenant-a",
          voidedByCreditNoteId: null,
          dteType: { notIn: [56, 61] },
          siiStatus: { notIn: ["ANNULLED", "REJECTED"] },
        }),
        orderBy: { date: "desc" },
      }),
    );
  });
});

describe("findDteCandidatesForBulk — regla CEDED", () => {
  it("excluye DTE CEDED con operación viva del array data", async () => {
    const txs = [
      {
        id: "t1",
        amount: dec(5_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "SCF SERVICIOS",
        reference: null,
      },
      {
        id: "t2",
        amount: dec(5_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "SCF SERVICIOS",
        reference: null,
      },
    ];
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue(txs);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      {
        id: "dte-ceded",
        direction: "ISSUED",
        code: "33",
        dteType: 33,
        folio: 1773,
        issuerName: "Gard",
        receiverName: "Cliente",
        receiverRut: null,
        issuerRut: null,
        totalAmount: dec(21_143_306),
        amountPaid: dec(21_143_306),
        amountPending: dec(0),
        date: new Date("2026-06-01"),
        paymentStatus: "CEDED",
        installationId: null,
        notes: null,
      },
      {
        id: "dte-open",
        direction: "ISSUED",
        code: "33",
        dteType: 33,
        folio: 100,
        issuerName: "Gard",
        receiverName: "Otro",
        receiverRut: null,
        issuerRut: null,
        totalAmount: dec(1_000_000),
        amountPaid: dec(0),
        amountPending: dec(1_000_000),
        date: new Date("2026-07-01"),
        paymentStatus: "UNPAID",
        installationId: null,
        notes: null,
      },
    ]);

    const data = await findDteCandidatesForBulk("tenant-a", ["t1", "t2"]);
    expect(data.find((d) => d.id === "dte-ceded")).toBeUndefined();
    expect(data.find((d) => d.id === "dte-open")).toBeTruthy();
  });

  it("DTE CEDED sin operación viva tampoco aparece como DTE", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "t1",
        amount: dec(1_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "pago",
        reference: null,
      },
      {
        id: "t2",
        amount: dec(1_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "pago",
        reference: null,
      },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      {
        id: "dte-orphan",
        direction: "ISSUED",
        code: "33",
        dteType: 33,
        folio: 50,
        issuerName: "Gard",
        receiverName: "X",
        receiverRut: null,
        issuerRut: null,
        totalAmount: dec(2_000_000),
        amountPaid: dec(2_000_000),
        amountPending: dec(0),
        date: new Date("2026-07-01"),
        paymentStatus: "CEDED",
        installationId: null,
        notes: null,
      },
    ]);
    const data = await findDteCandidatesForBulk("tenant-a", ["t1", "t2"]);
    expect(data).toHaveLength(0);
  });
});

describe("findFactoringBatches", () => {
  it("usa fallback sum_sim y marca matchesDeposit", async () => {
    asMock(prisma.financeFactoringBatch.findMany).mockResolvedValue([
      {
        id: "batch-1",
        code: "LOT-1",
        fechaCesion: new Date("2026-07-01"),
        totalMontoAGirar: null,
        operationsCount: 2,
        factoringCompany: { razonSocial: "SCF SERVICIOS F" },
        operations: [
          { id: "op-a", simMontoAGirar: dec(10_000_000), netAdvance: dec(9_000_000) },
          { id: "op-b", simMontoAGirar: dec(20_004_887), netAdvance: dec(19_000_000) },
        ],
      },
    ]);

    const batches = await findFactoringBatches("tenant-a", {
      companyId: "co-scf",
      minDate: new Date("2026-01-01"),
      maxDate: new Date("2026-12-31"),
      totalAbs: 30_004_887,
    });
    expect(batches).toHaveLength(1);
    expect(batches[0]!.totalSource).toBe("sum_sim");
    expect(batches[0]!.matchesDeposit).toBe(true);
    expect(batches[0]!.operationIds).toEqual(["op-a", "op-b"]);
  });
});

describe("searchReconcileCandidates", () => {
  it("consulta numérica de folio cedido devuelve la cesión", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([
      {
        id: "t1",
        amount: dec(7_000_000),
        transactionDate: new Date("2026-07-15"),
        description: "SCF SERVICIOS",
        reference: null,
      },
    ]);
    asMock(prisma.financeDte.findMany).mockResolvedValue([
      { id: "dte-1773" },
    ]);
    asMock(prisma.financeFactoringOperation.findMany).mockResolvedValue([
      makeOp({ id: "op-1773", dte: { folio: 1773, receiverName: "Cliente", installationId: null, paymentStatus: "CEDED" } }),
    ]);

    const result = await searchReconcileCandidates("tenant-a", {
      bankTxIds: ["t1"],
      query: "1773",
      scope: "factoring",
    });
    expect(result.data).toHaveLength(0);
    expect(result.factoring.some((c) => c.dteFolio === 1773)).toBe(true);
  });

  it("no devuelve filas de otro tenantId", async () => {
    asMock(prisma.financeBankTransaction.findMany).mockResolvedValue([]);
    const result = await searchReconcileCandidates("tenant-a", {
      bankTxIds: ["t-foreign"],
      query: "1773",
    });
    expect(result.data).toHaveLength(0);
    expect(result.factoring).toHaveLength(0);
    // findMany de bank tx siempre filtra por tenantId
    expect(prisma.financeBankTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: "tenant-a" }),
      }),
    );
  });
});
