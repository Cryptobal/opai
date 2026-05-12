/**
 * El pipeline de auto-sync CpqQuote → FinanceCashflowItem fue eliminado
 * (2026-05-11). Las funciones existentes son no-ops para no romper callers.
 * Se agregó `migrateContractItemsToManual` para convertir items legacy
 * source=CONTRACT en source=OTHER (editables manualmente).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/prisma", () => {
  return {
    prisma: {
      cpqQuote: { findFirst: vi.fn() },
      financeCashflowItem: {
        findMany: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
      },
      docAssociation: { findFirst: vi.fn() },
    },
  };
});

import { prisma } from "@/lib/prisma";
import {
  syncContractItemForQuote,
  backfillContractItems,
  setContractItemsActive,
  migrateContractItemsToManual,
} from "../generators/sales-contract-sync";

const TENANT = "tenant-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sales-contract-sync — deprecated pipeline", () => {
  it("syncContractItemForQuote es no-op", async () => {
    const r = await syncContractItemForQuote(TENANT, "quote-1");
    expect(r).toEqual({ action: "noop" });
    expect(prisma.cpqQuote.findFirst).not.toHaveBeenCalled();
  });

  it("backfillContractItems retorna stats vacíos sin tocar DB", async () => {
    const r = await backfillContractItems(TENANT);
    expect(r).toEqual({
      created: 0,
      updated: 0,
      reactivated: 0,
      deactivated: 0,
    });
  });

  it("setContractItemsActive solo toca items LEGACY (sourceRefId = CpqQuote)", async () => {
    // Dos items source=CONTRACT: uno legacy (apunta a quote), uno nuevo
    // (apunta a Document — la cpqQuote no existe).
    (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        { id: "item-legacy", sourceRefId: "quote-1" },
        { id: "item-nuevo", sourceRefId: "doc-1" },
      ]);
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "quote-1" }) // legacy: quote sí existe
      .mockResolvedValueOnce(null); // nuevo: el sourceRefId apunta a Document
    (prisma.financeCashflowItem.updateMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ count: 1 });

    const r = await setContractItemsActive(TENANT, false);
    expect(r).toEqual({ affected: 1 });
    expect(prisma.financeCashflowItem.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["item-legacy"] } },
      data: { isActive: false },
    });
  });
});

describe("migrateContractItemsToManual", () => {
  it("convierte CONTRACT → OTHER y reescribe sourceRefId al documento asociado", async () => {
    (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([
        { id: "item-1", sourceRefId: "quote-1" },
        { id: "item-2", sourceRefId: "quote-2" },
      ]);
    // quote-1 tiene deal con documento asociado
    (prisma.cpqQuote.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ dealId: "deal-1" })
      .mockResolvedValueOnce({ dealId: "deal-2" });
    (prisma.docAssociation.findFirst as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ documentId: "doc-1" })
      .mockResolvedValueOnce(null); // quote-2 sin documento

    const result = await migrateContractItemsToManual(TENANT);

    expect(result).toEqual({ migrated: 2, withDocument: 1, orphan: 1 });
    expect(prisma.financeCashflowItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: { source: "OTHER", sourceRefId: "doc-1" },
    });
    expect(prisma.financeCashflowItem.update).toHaveBeenCalledWith({
      where: { id: "item-2" },
      data: { source: "OTHER", sourceRefId: "quote-2" },
    });
  });

  it("retorna 0 si no hay items CONTRACT", async () => {
    (prisma.financeCashflowItem.findMany as ReturnType<typeof vi.fn>)
      .mockResolvedValue([]);
    const r = await migrateContractItemsToManual(TENANT);
    expect(r).toEqual({ migrated: 0, withDocument: 0, orphan: 0 });
    expect(prisma.financeCashflowItem.update).not.toHaveBeenCalled();
  });
});
