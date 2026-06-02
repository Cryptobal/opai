/**
 * Tests del matcher draft DTE → occurrence proyectada. Mockea Prisma para
 * validar criterios de selección sin DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findUnique: vi.fn() },
    financeCashflowItem: { findMany: vi.fn() },
    financeCashflowOccurrence: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

// UF fija para los tests de desambiguación por monto (items en UF → CLP).
vi.mock("../uf-resolver", () => ({
  resolveUfForOccurrence: vi.fn().mockResolvedValue(39_000),
}));

import { prisma } from "@/lib/prisma";
import {
  matchDraftToOccurrence,
  rebindDraftOccurrencesToIssued,
} from "../draft-occurrence-matcher.service";

type Mock = ReturnType<typeof vi.fn>;

const TENANT = "tenant-1";
const DTE_ID = "dte-1";

beforeEach(() => {
  vi.clearAllMocks();
  // DTE válido por default (factura electrónica tipo 33).
  (prisma.financeDte.findUnique as Mock).mockResolvedValue({ dteType: 33 });
  // Por default no hay vínculo previo — el guard de idempotencia pasa.
  (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValue(null);
  (prisma.financeCashflowOccurrence.update as Mock).mockResolvedValue({ id: "occ-1" });
  (prisma.financeCashflowOccurrence.updateMany as Mock).mockResolvedValue({ count: 0 });
  // Materialize-when-missing (#548): si no hay candidata, el matcher crea la
  // cuota de la programación y la vincula. Mock devuelve la fila creada.
  (prisma.financeCashflowOccurrence.upsert as Mock).mockResolvedValue({ id: "occ-created" });
});

describe("matchDraftToOccurrence", () => {
  it("vincula la occurrence proyectada del cliente al DTE", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1", recurrence: "MONTHLY" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-1",
        scheduledDate: new Date("2026-05-15"),
        amountClp: 1_000_000,
        itemId: "item-1",
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-1" });
    expect(prisma.financeCashflowOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-1" },
      data: { dteId: DTE_ID },
    });
  });

  it("vincula vía instalación cuando no hay cliente CRM", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-2", recurrence: "MONTHLY" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-2",
        scheduledDate: new Date("2026-05-14"),
        amountClp: 500_000,
        itemId: "item-2",
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: null,
      installationId: "inst-1",
      expectedDate: new Date("2026-05-13"),
      amountClp: 500_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-2" });
  });

  it("devuelve null cuando no hay items del cliente/instalación", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toBeNull();
    expect(prisma.financeCashflowOccurrence.update).not.toHaveBeenCalled();
  });

  it("sin candidatas materializa la cuota de la programación y la vincula (#548)", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1", recurrence: "MONTHLY", installationId: null, amount: 1_000_000, currency: "CLP" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    // Ya no devuelve null: crea la cuota del item para ese bucket con el dteId.
    expect(result).toEqual({ occurrenceId: "occ-created" });
    const upsertArg = (prisma.financeCashflowOccurrence.upsert as Mock).mock.calls[0][0];
    expect(upsertArg.create.itemId).toBe("item-1");
    expect(upsertArg.create.dteId).toBe(DTE_ID);
    expect(upsertArg.update.dteId).toBe(DTE_ID);
  });

  it("devuelve null cuando no hay crmAccountId ni installationId", async () => {
    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: null,
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toBeNull();
    expect(prisma.financeCashflowItem.findMany).not.toHaveBeenCalled();
  });

  it("con dos candidatas, gana la más cercana al DTE", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1", recurrence: "MONTHLY" },
    ]);
    // Dos candidatas, ambas dentro de la ventana. Gana la de menor distancia.
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-late",
        scheduledDate: new Date("2026-05-30"),
        amountClp: 1_000_000,
        itemId: "item-1",
      },
      {
        id: "occ-early",
        scheduledDate: new Date("2026-05-15"),
        amountClp: 1_500_000,
        itemId: "item-1",
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-early" });
    expect(prisma.financeCashflowOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-early" },
      data: { dteId: DTE_ID },
    });
  });

  it("empate exacto en scheduledDate desempata por monto más cercano", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1", recurrence: "MONTHLY" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-far",
        scheduledDate: new Date("2026-05-20"),
        amountClp: 1_500_000,
        itemId: "item-1",
      },
      {
        id: "occ-close",
        scheduledDate: new Date("2026-05-20"),
        amountClp: 1_000_000,
        itemId: "item-1",
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-close" });
  });

  it("consulta con ventana amplia ±180 días en SQL y filtra por recurrencia en memoria", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1", recurrence: "WEEKLY", installationId: null, amount: 1_000_000, currency: "CLP" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-far",
        scheduledDate: new Date("2026-04-15"), // 30 días antes: fuera de WEEKLY
        amountClp: 1_000_000,
        itemId: "item-1",
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    // La occ a 30 días queda fuera de la ventana WEEKLY → no se elige esa;
    // como no hay candidata en bucket, se materializa la cuota nueva (#548).
    expect(result).toEqual({ occurrenceId: "occ-created" });
    expect((prisma.financeCashflowOccurrence.update as Mock)).not.toHaveBeenCalled();
    const findManyCall = (prisma.financeCashflowOccurrence.findMany as Mock).mock
      .calls[0]?.[0];
    expect(findManyCall).toBeDefined();
    expect(findManyCall.where.scheduledDate.gte).toEqual(new Date("2025-11-14"));
    expect(findManyCall.where.scheduledDate.lte).toEqual(new Date("2026-11-09"));
  });

  it("idempotente: si el DTE ya tiene una occurrence vinculada, devuelve esa y no busca", async () => {
    (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValue({
      id: "occ-already",
    });

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-already" });
    // No busca items ni candidatas porque ya hay vínculo.
    expect(prisma.financeCashflowItem.findMany).not.toHaveBeenCalled();
    expect(prisma.financeCashflowOccurrence.findMany).not.toHaveBeenCalled();
    expect(prisma.financeCashflowOccurrence.update).not.toHaveBeenCalled();
  });

  it("no incluye occurrences ya vinculadas a otro DTE (filtra por dteId=null en la query)", async () => {
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-1", recurrence: "MONTHLY" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([]);

    await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-1",
      installationId: null,
      expectedDate: new Date("2026-05-13"),
      amountClp: 1_000_000,
    });

    const findManyCall = (prisma.financeCashflowOccurrence.findMany as Mock).mock
      .calls[0]?.[0];
    expect(findManyCall).toBeDefined();
    expect(findManyCall.where.dteId).toBeNull();
    expect(findManyCall.where.status).toBe("PROJECTED");
  });

  it("retorna null si el DTE es nota de crédito (dteType=61)", async () => {
    (prisma.financeDte.findUnique as Mock).mockResolvedValue({ dteType: 61 });

    const result = await matchDraftToOccurrence({
      tenantId: "tenant-test",
      dteId: "nc-id",
      crmAccountId: "account-test",
      installationId: null,
      expectedDate: new Date("2026-05-15"),
      amountClp: 100000,
    });

    expect(result).toBeNull();
    // El guard NC/ND corta antes del guard de idempotencia y de la búsqueda.
    expect(prisma.financeCashflowOccurrence.findFirst).not.toHaveBeenCalled();
    expect(prisma.financeCashflowItem.findMany).not.toHaveBeenCalled();
  });

  it("retorna null si el DTE es nota de débito (dteType=56)", async () => {
    (prisma.financeDte.findUnique as Mock).mockResolvedValue({ dteType: 56 });

    const result = await matchDraftToOccurrence({
      tenantId: "tenant-test",
      dteId: "nd-id",
      crmAccountId: "account-test",
      installationId: null,
      expectedDate: new Date("2026-05-15"),
      amountClp: 100000,
    });

    expect(result).toBeNull();
    expect(prisma.financeCashflowOccurrence.findFirst).not.toHaveBeenCalled();
    expect(prisma.financeCashflowItem.findMany).not.toHaveBeenCalled();
  });

  it("matchea cuota proyectada anterior al DTE dentro de la ventana del recurrence", async () => {
    (prisma.financeDte.findUnique as Mock).mockResolvedValue({ dteType: 33 });
    (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValue(null);
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-monthly", recurrence: "MONTHLY" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-1",
        scheduledDate: new Date("2026-05-05"),
        amountClp: 24_187_864,
        itemId: "item-monthly",
      },
    ]);
    (prisma.financeCashflowOccurrence.update as Mock).mockResolvedValue({});

    const result = await matchDraftToOccurrence({
      tenantId: "tenant-test",
      dteId: "dte-1694",
      crmAccountId: "account-brasil",
      installationId: null,
      expectedDate: new Date("2026-05-15"),
      amountClp: 24_024_231,
    });

    expect(result).toEqual({ occurrenceId: "occ-1" });
    expect(prisma.financeCashflowOccurrence.update).toHaveBeenCalledWith({
      where: { id: "occ-1" },
      data: { dteId: "dte-1694" },
    });
  });

  it("respeta ventana WEEKLY de ±14 días (no engancha la occ lejana; materializa nueva)", async () => {
    (prisma.financeDte.findUnique as Mock).mockResolvedValue({ dteType: 33 });
    (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValue(null);
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-weekly", recurrence: "WEEKLY", installationId: null, amount: 100_000, currency: "CLP" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-lejos",
        scheduledDate: new Date("2026-04-15"), // 30 días antes: fuera de WEEKLY
        amountClp: 100_000,
        itemId: "item-weekly",
      },
    ]);

    const result = await matchDraftToOccurrence({
      tenantId: "tenant-test",
      dteId: "dte-x",
      crmAccountId: "account-x",
      installationId: null,
      expectedDate: new Date("2026-05-15"),
      amountClp: 100_000,
    });

    // No engancha la occ a 30 días (fuera de ventana); materializa la cuota
    // del bucket del DTE en vez de devolver null (#548).
    expect(result).toEqual({ occurrenceId: "occ-created" });
    expect((prisma.financeCashflowOccurrence.update as Mock)).not.toHaveBeenCalled();
  });

  it("desambigua por monto entre items del mismo installation (Transmat 80% vs 20%)", async () => {
    // Cobro partido: dos programaciones UF en la misma instalación. El DTE de
    // $5.5M debe enganchar al item de 141 UF (≈5.5M), NO al de 34 UF (≈1.3M),
    // aunque el de 34 UF venga primero en la lista. Sin candidatas materializadas.
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-20", recurrence: "MONTHLY", installationId: "inst-trans", amount: 34, currency: "UF" },
      { id: "item-80", recurrence: "MONTHLY", installationId: "inst-trans", amount: 141, currency: "UF" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([]);

    const result = await matchDraftToOccurrence({
      tenantId: TENANT,
      dteId: DTE_ID,
      crmAccountId: "acc-trans",
      installationId: "inst-trans",
      expectedDate: new Date("2026-06-01"),
      amountClp: 5_509_247,
    });

    expect(result).toEqual({ occurrenceId: "occ-created" });
    const upsertArg = (prisma.financeCashflowOccurrence.upsert as Mock).mock.calls[0][0];
    // 141 UF * 39.000 = 5.499.000 ≈ 5.509.247 → gana item-80, no item-20.
    expect(upsertArg.create.itemId).toBe("item-80");
  });

  it("gana el candidato MÁS CERCANO en días, no el primero cronológico", async () => {
    (prisma.financeDte.findUnique as Mock).mockResolvedValue({ dteType: 33 });
    (prisma.financeCashflowOccurrence.findFirst as Mock).mockResolvedValue(null);
    (prisma.financeCashflowItem.findMany as Mock).mockResolvedValue([
      { id: "item-monthly", recurrence: "MONTHLY" },
    ]);
    (prisma.financeCashflowOccurrence.findMany as Mock).mockResolvedValue([
      {
        id: "occ-lejos-anterior",
        scheduledDate: new Date("2026-04-20"), // 25 días antes
        amountClp: 100_000,
        itemId: "item-monthly",
      },
      {
        id: "occ-cerca-posterior",
        scheduledDate: new Date("2026-05-18"), // 3 días después -> gana
        amountClp: 100_000,
        itemId: "item-monthly",
      },
    ]);
    (prisma.financeCashflowOccurrence.update as Mock).mockResolvedValue({});

    const result = await matchDraftToOccurrence({
      tenantId: "tenant-test",
      dteId: "dte-y",
      crmAccountId: "account-y",
      installationId: null,
      expectedDate: new Date("2026-05-15"),
      amountClp: 100_000,
    });

    expect(result).toEqual({ occurrenceId: "occ-cerca-posterior" });
  });
});

describe("rebindDraftOccurrencesToIssued", () => {
  it("reasigna todas las occurrences del draft al DTE emitido y devuelve el count", async () => {
    (prisma.financeCashflowOccurrence.updateMany as Mock).mockResolvedValue({
      count: 3,
    });

    const count = await rebindDraftOccurrencesToIssued(
      TENANT,
      "draft-1",
      "issued-1",
    );

    expect(count).toBe(3);
    expect(prisma.financeCashflowOccurrence.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, dteId: "draft-1" },
      data: { dteId: "issued-1" },
    });
  });
});
