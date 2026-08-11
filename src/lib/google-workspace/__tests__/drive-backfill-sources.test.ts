import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readsUnified: vi.fn(),
  extractStorageKeyFromPublicUrl: vi.fn(),
  resolveCrmFileTarget: vi.fn(),
  documentoEnlaceFindMany: vi.fn(),
  opsDocumentoPersonaFindMany: vi.fn(),
  docOperacionalFindMany: vi.fn(),
  financeDteFindMany: vi.fn(),
  opsGuardiaFindMany: vi.fn(),
  crmInstallationFindMany: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/docs/migration", () => ({
  readsUnified: mocks.readsUnified,
}));

vi.mock("@/lib/storage", () => ({
  extractStorageKeyFromPublicUrl: mocks.extractStorageKeyFromPublicUrl,
}));

vi.mock("../drive-crm-target", () => ({
  resolveCrmFileTarget: mocks.resolveCrmFileTarget,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentoEnlace: { findMany: mocks.documentoEnlaceFindMany },
    opsDocumentoPersona: { findMany: mocks.opsDocumentoPersonaFindMany },
    docOperacional: { findMany: mocks.docOperacionalFindMany },
    financeDte: { findMany: mocks.financeDteFindMany },
    opsGuardia: { findMany: mocks.opsGuardiaFindMany },
    crmInstallation: { findMany: mocks.crmInstallationFindMany },
    $queryRaw: mocks.queryRaw,
  },
}));

import { BACKFILL_SOURCES } from "../drive-backfill-sources";

describe("BACKFILL_SOURCES", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readsUnified.mockResolvedValue(false);
    mocks.resolveCrmFileTarget.mockResolvedValue({
      docType: "documentos",
      path: "Comercial/Cuentas/Acme/General",
    });
  });

  it("crm documentos lista enlaces con storageKey", async () => {
    mocks.documentoEnlaceFindMany.mockResolvedValue([
      {
        id: "l1",
        entityType: "account",
        entityId: "a1",
        file: {
          id: "f1",
          storageKey: "t/a.pdf",
          fileName: "a.pdf",
          mimeType: "application/pdf",
        },
      },
    ]);
    const page = await BACKFILL_SOURCES.documentos.listPending("t1", 10);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.r2Key).toBe("t/a.pdf");
    expect(page.skipped).toBe(0);
  });

  it("trabajadores omite fila sin storageKey derivable y la cuenta en skipped", async () => {
    mocks.opsDocumentoPersonaFindMany.mockResolvedValue([
      {
        id: "d1",
        guardiaId: "g1",
        fileUrl: "https://cdn.example/x.pdf",
        fileName: "x.pdf",
        mimeType: "application/pdf",
        guardia: {
          persona: { rut: "1-9", firstName: "Ana", lastName: "Pérez" },
        },
      },
      {
        id: "d2",
        guardiaId: "g2",
        fileUrl: "https://external/y.pdf",
        fileName: "y.pdf",
        mimeType: "application/pdf",
        guardia: { persona: { rut: "2-7", firstName: "Bo", lastName: "Li" } },
      },
    ]);
    mocks.extractStorageKeyFromPublicUrl
      .mockReturnValueOnce("tenant/x.pdf")
      .mockReturnValueOnce(null);

    const page = await BACKFILL_SOURCES.trabajadores.listPending("t1", 10);
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.sourceId).toBe("d1");
    expect(page.items[0]?.targetPath).toContain("Personas/");
    expect(page.skipped).toBe(1);
  });

  it("ops_documentos usa storageKey directo", async () => {
    mocks.docOperacionalFindMany.mockResolvedValue([
      {
        id: "o1",
        storageKey: "ops/a.pdf",
        fileName: "a.pdf",
        mimeType: "application/pdf",
        capa: "global",
        installationId: null,
        installation: null,
      },
    ]);
    const page = await BACKFILL_SOURCES.ops_documentos.listPending("t1", 10);
    expect(page.items[0]).toMatchObject({
      sourceType: "doc_operacional",
      r2Key: "ops/a.pdf",
      targetPath: "Operaciones/Documentos generales",
    });
  });

  it("factura pagina con nextCursor cuando hay más", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `dte-${i}`,
      pdfR2Key: `pdf/${i}.pdf`,
      code: `F-${i}`,
      receiverName: "Cliente",
    }));
    mocks.financeDteFindMany.mockResolvedValue(rows);
    const page = await BACKFILL_SOURCES.factura.listPending("t1", 2);
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("dte-1");
  });

  it("cotizacion no tiene fuente listable", async () => {
    const page = await BACKFILL_SOURCES.cotizacion.listPending("t1", 10);
    expect(page.items).toEqual([]);
    expect(page.skipped).toBe(0);
  });

  it("licitacion usa query de deals isLicitacion", async () => {
    mocks.queryRaw.mockResolvedValue([
      {
        id: "fl1",
        entityType: "deal",
        entityId: "deal1",
        file: {
          id: "f1",
          storageKey: "k",
          fileName: "b.pdf",
          mimeType: "application/pdf",
        },
      },
    ]);
    mocks.resolveCrmFileTarget.mockResolvedValue({
      docType: "licitacion",
      path: "Comercial/Licitaciones/2026/Lic",
    });
    const page = await BACKFILL_SOURCES.licitacion.listPending("t1", 10);
    expect(page.items[0]?.targetPath).toContain("Licitaciones");
    expect(mocks.queryRaw).toHaveBeenCalled();
  });
});
