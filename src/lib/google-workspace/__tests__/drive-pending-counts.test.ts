import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readsUnified: vi.fn(),
  documentoEnlaceGroupBy: vi.fn(),
  documentoEnlaceCount: vi.fn(),
  opsDocumentoPersonaCount: vi.fn(),
  docOperacionalCount: vi.fn(),
  financeDteCount: vi.fn(),
  driveExportOutboxGroupBy: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/docs/migration", () => ({
  readsUnified: mocks.readsUnified,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentoEnlace: {
      groupBy: mocks.documentoEnlaceGroupBy,
      count: mocks.documentoEnlaceCount,
    },
    opsDocumentoPersona: { count: mocks.opsDocumentoPersonaCount },
    docOperacional: { count: mocks.docOperacionalCount },
    financeDte: { count: mocks.financeDteCount },
    driveExportOutbox: { groupBy: mocks.driveExportOutboxGroupBy },
    $queryRaw: mocks.queryRaw,
  },
}));

import {
  clearPendingCountsCache,
  getPendingCounts,
} from "../drive-pending-counts";

describe("getPendingCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingCountsCache();
    mocks.readsUnified.mockResolvedValue(false);
    mocks.documentoEnlaceGroupBy.mockResolvedValue([
      { entityType: "account", _count: { _all: 10 } },
      { entityType: "installation", _count: { _all: 5 } },
      { entityType: "contact", _count: { _all: 3 } },
      { entityType: "lead", _count: { _all: 2 } },
    ]);
    mocks.queryRaw
      .mockResolvedValueOnce([
        { is_licitacion: true, total: 4 },
        { is_licitacion: false, total: 8 },
      ])
      .mockResolvedValueOnce([{ pending_folders: 18 }]);
    mocks.driveExportOutboxGroupBy.mockResolvedValue([
      { docType: "documentos", sourceId: "a" },
      { docType: "documentos", sourceId: "b" },
      { docType: "trabajadores", sourceId: "t1" },
    ]);
    mocks.financeDteCount.mockResolvedValue(7);
    mocks.opsDocumentoPersonaCount.mockResolvedValue(50);
    mocks.docOperacionalCount.mockResolvedValue(12);
  });

  it("calcula total/pending por tipo sin consultas en bucle", async () => {
    const counts = await getPendingCounts("tenant-1");

    expect(counts.documentos).toEqual({ total: 15, pending: 13 });
    expect(counts.personas).toEqual({ total: 3, pending: 3 });
    expect(counts.leads).toEqual({ total: 2, pending: 2 });
    expect(counts.licitacion).toEqual({
      total: 4,
      pending: 4,
      pendingFolders: 18,
    });
    expect(counts.negocios).toEqual({ total: 8, pending: 8 });
    expect(counts.factura).toEqual({ total: 7, pending: 7 });
    expect(counts.trabajadores).toEqual({ total: 50, pending: 49 });
    expect(counts.ops_documentos).toEqual({ total: 12, pending: 12 });
    expect(counts.cotizacion).toEqual({ total: 0, pending: 0 });

    // Fuentes agregadas: groupBy enlaces + groupBy outbox + counts + 2 raw.
    expect(mocks.documentoEnlaceGroupBy).toHaveBeenCalledTimes(1);
    expect(mocks.driveExportOutboxGroupBy).toHaveBeenCalledTimes(1);
    expect(mocks.opsDocumentoPersonaCount).toHaveBeenCalledTimes(1);
    expect(mocks.docOperacionalCount).toHaveBeenCalledTimes(1);
    expect(mocks.queryRaw).toHaveBeenCalledTimes(2);
  });

  it("sin pendientes: Al día (pending 0)", async () => {
    mocks.documentoEnlaceGroupBy.mockResolvedValue([]);
    mocks.queryRaw
      .mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ pending_folders: 0 }]);
    mocks.driveExportOutboxGroupBy.mockResolvedValue([
      { docType: "trabajadores", sourceId: "t1" },
      { docType: "trabajadores", sourceId: "t2" },
    ]);
    mocks.financeDteCount.mockResolvedValue(0);
    mocks.opsDocumentoPersonaCount.mockResolvedValue(2);
    mocks.docOperacionalCount.mockResolvedValue(0);

    const counts = await getPendingCounts("tenant-2");
    expect(counts.trabajadores).toEqual({ total: 2, pending: 0 });
    expect(counts.ops_documentos).toEqual({ total: 0, pending: 0 });
  });

  it("usa modelo unificado cuando readsUnified es true", async () => {
    mocks.readsUnified.mockResolvedValue(true);
    mocks.documentoEnlaceCount
      .mockResolvedValueOnce(30) // trabajadores
      .mockResolvedValueOnce(9); // ops

    const counts = await getPendingCounts("tenant-3");
    expect(counts.trabajadores.total).toBe(30);
    expect(counts.ops_documentos.total).toBe(9);
    expect(mocks.opsDocumentoPersonaCount).not.toHaveBeenCalled();
    expect(mocks.docOperacionalCount).not.toHaveBeenCalled();
  });

  it("cachea por tenant 60s", async () => {
    await getPendingCounts("tenant-cache");
    await getPendingCounts("tenant-cache");
    expect(mocks.documentoEnlaceGroupBy).toHaveBeenCalledTimes(1);
  });
});
