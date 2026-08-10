import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    driveExportOutbox: { findFirst: vi.fn() },
    driveIngestedFile: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      create: vi.fn(),
    },
    crmFile: { create: vi.fn() },
    crmFileLink: { create: vi.fn() },
  },
}));

vi.mock("@/lib/storage", () => ({
  uploadFile: vi.fn(),
  STORAGE_PROVIDER: "r2",
}));

vi.mock("../drive-read.service", () => ({
  downloadDriveFile: vi.fn(),
}));

vi.mock("../drive-tree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../drive-tree")>();
  return {
    ...actual,
    resolveEntityFromFolderId: vi.fn(),
  };
});

vi.mock("../drive-crm-target", () => ({
  resolveCrmFileTarget: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { processDriveChange } from "../drive-ingest-process";
import { resolveEntityFromFolderId } from "../drive-tree";
import { resolveCrmFileTarget } from "../drive-crm-target";
import { isKnownDriveFile } from "../drive-ingest-helpers";

const baseFile = {
  id: "file-1",
  name: "bases.pdf",
  mimeType: "application/pdf",
  size: 1024,
  parents: ["folder-deal"],
  trashed: false,
};

describe("processDriveChange / anti-loop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignora archivo exportado por OPAI (nunca re-ingiere)", async () => {
    vi.mocked(prisma.driveExportOutbox.findFirst).mockResolvedValue({ id: "ob1" } as never);
    vi.mocked(prisma.driveIngestedFile.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.driveIngestedFile.upsert).mockResolvedValue({} as never);

    const outcome = await processDriveChange(
      "t1",
      { fileId: "file-1", removed: false, file: baseFile },
      { licitacion: true, negocios: true },
      new Set(["crm"]),
    );

    expect(outcome).toBe("ignored");
    expect(prisma.driveIngestedFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: "exportado_por_opai" }),
      }),
    );
    expect(prisma.crmFile.create).not.toHaveBeenCalled();
  });

  it("ignora carpeta desconocida", async () => {
    vi.mocked(prisma.driveExportOutbox.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.driveIngestedFile.findUnique).mockResolvedValue(null);
    vi.mocked(resolveEntityFromFolderId).mockResolvedValue(null);
    vi.mocked(prisma.driveIngestedFile.upsert).mockResolvedValue({} as never);

    const outcome = await processDriveChange(
      "t1",
      { fileId: "file-1", removed: false, file: baseFile },
      { licitacion: true },
      new Set(["crm"]),
    );
    expect(outcome).toBe("ignored");
    expect(prisma.driveIngestedFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: "carpeta_desconocida" }),
      }),
    );
  });

  it("ignora demasiado_grande", async () => {
    vi.mocked(prisma.driveExportOutbox.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.driveIngestedFile.findUnique).mockResolvedValue(null);
    vi.mocked(resolveEntityFromFolderId).mockResolvedValue({
      entityType: "deal",
      entityId: "d1",
      pathKey: "Comercial/Licitaciones/2026/X",
      driveFolderId: "folder-deal",
    });
    vi.mocked(resolveCrmFileTarget).mockResolvedValue({
      docType: "licitacion",
      path: "Comercial/Licitaciones/2026/X",
      entity: { type: "deal", id: "d1" },
    });
    vi.mocked(prisma.driveIngestedFile.upsert).mockResolvedValue({} as never);

    const outcome = await processDriveChange(
      "t1",
      {
        fileId: "file-big",
        removed: false,
        file: { ...baseFile, id: "file-big", size: 30 * 1024 * 1024 },
      },
      { licitacion: true },
      new Set(["crm"]),
    );
    expect(outcome).toBe("ignored");
    expect(prisma.driveIngestedFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: "demasiado_grande" }),
      }),
    );
  });

  it("ignora módulo personas (excluido)", async () => {
    vi.mocked(prisma.driveExportOutbox.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.driveIngestedFile.findUnique).mockResolvedValue(null);
    vi.mocked(resolveEntityFromFolderId).mockResolvedValue({
      entityType: "trabajador",
      entityId: "g1",
      pathKey: "Personas/RUT",
      driveFolderId: "folder-p",
    });
    vi.mocked(prisma.driveIngestedFile.upsert).mockResolvedValue({} as never);

    const outcome = await processDriveChange(
      "t1",
      {
        fileId: "file-p",
        removed: false,
        file: { ...baseFile, id: "file-p", parents: ["folder-p"] },
      },
      { trabajadores: true },
      new Set(["personas"]),
    );
    expect(outcome).toBe("ignored");
    expect(prisma.driveIngestedFile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reason: "modulo_no_habilitado" }),
      }),
    );
  });
});

describe("isKnownDriveFile", () => {
  it("prioriza ingested sobre outbox", async () => {
    vi.mocked(prisma.driveExportOutbox.findFirst).mockResolvedValue({ id: "o" } as never);
    vi.mocked(prisma.driveIngestedFile.findUnique).mockResolvedValue({ id: "i" } as never);
    expect(await isKnownDriveFile("t1", "f1")).toBe("ingested");
  });
});
