import { beforeEach, describe, expect, it, vi } from "vitest";

const ensureTipoForLegacyType = vi.fn();
const readsUnified = vi.fn();

vi.mock("@/lib/docs/ensure-tipo", () => ({
  ensureTipoForLegacyType: (...args: unknown[]) => ensureTipoForLegacyType(...args),
}));

vi.mock("@/lib/docs/migration", () => ({
  readsUnified: (...args: unknown[]) => readsUnified(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsDocumentoPersona: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    documento: {
      update: vi.fn(),
    },
    documentoEnlace: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  getGuardiaDocTypeIndex,
  updatePersonaDoc,
} from "@/lib/docs/persona-docs-service";

const unifiedLink = {
  entityId: "g1",
  folderId: null,
  folder: null,
  file: {
    id: "doc1",
    tenantId: "t1",
    fileUrl: "https://files.example/a.pdf",
    fileName: "antecedentes.pdf",
    mimeType: "application/pdf",
    status: "pendiente",
    issuedAt: null,
    expiresAt: null,
    notes: null,
    validatedBy: null,
    validatedAt: null,
    portalVisible: false,
    lastExpiryMilestone: null,
    lastExpiryMilestoneAt: null,
    renewalInProgressUntil: null,
    renewalMarkedBy: null,
    renewalMarkedAt: null,
    expiryDismissedAt: null,
    expiryDismissedBy: null,
    expiryDismissedReason: null,
    createdAt: new Date("2026-09-01"),
    needsAttention: false,
    tipo: { codigo: "historial_penal" },
  },
};

describe("updatePersonaDoc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rama unificada: ignora claves undefined y no llama ensureTipoForLegacyType", async () => {
    readsUnified.mockResolvedValue(true);
    vi.mocked(prisma.documentoEnlace.findFirst).mockResolvedValue(unifiedLink as never);

    const result = await updatePersonaDoc("t1", "g1", "doc1", {
      type: undefined,
      fileUrl: undefined,
      portalVisible: true,
      expiresAt: new Date("2027-01-01"),
    });

    expect(ensureTipoForLegacyType).not.toHaveBeenCalled();
    expect(prisma.documento.update).toHaveBeenCalledWith({
      where: { id: "doc1" },
      data: {
        portalVisible: true,
        expiresAt: new Date("2027-01-01"),
      },
    });
    expect(result?.type).toBe("historial_penal");
  });

  it("rama unificada: type explícito sí re-tipifica", async () => {
    readsUnified.mockResolvedValue(true);
    vi.mocked(prisma.documentoEnlace.findFirst).mockResolvedValue(unifiedLink as never);
    ensureTipoForLegacyType.mockResolvedValue({ tipoId: "tipo-hp", created: false });

    await updatePersonaDoc("t1", "g1", "doc1", { type: "historial_penal" });

    expect(ensureTipoForLegacyType).toHaveBeenCalledWith(
      prisma,
      "t1",
      "historial_penal",
      false
    );
    expect(prisma.documento.update).toHaveBeenCalledWith({
      where: { id: "doc1" },
      data: { tipoId: "tipo-hp" },
    });
  });

  it("rama legado: ignora claves undefined y no llama ensureTipoForLegacyType", async () => {
    readsUnified.mockResolvedValue(false);
    vi.mocked(prisma.opsDocumentoPersona.findFirst).mockResolvedValue({
      id: "doc1",
      guardiaId: "g1",
      tenantId: "t1",
    } as never);
    vi.mocked(prisma.opsDocumentoPersona.update).mockResolvedValue({
      id: "doc1",
      type: "historial_penal",
      portalVisible: true,
    } as never);

    await updatePersonaDoc("t1", "g1", "doc1", {
      type: undefined,
      portalVisible: true,
    });

    expect(ensureTipoForLegacyType).not.toHaveBeenCalled();
    expect(prisma.opsDocumentoPersona.update).toHaveBeenCalledWith({
      where: { id: "doc1" },
      data: { portalVisible: true },
    });
  });
});

describe("getGuardiaDocTypeIndex", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rama legado mapea contrato → contrato_guardia", async () => {
    readsUnified.mockResolvedValue(false);
    vi.mocked(prisma.opsDocumentoPersona.findMany).mockResolvedValue([
      { guardiaId: "g1", type: "contrato" },
      { guardiaId: "g1", type: "historial_penal" },
      { guardiaId: "g2", type: "certificado_os10" },
    ] as never);

    const index = await getGuardiaDocTypeIndex("t1", ["g1", "g2"]);
    expect(index.get("g1")?.has("contrato_guardia")).toBe(true);
    expect(index.get("g1")?.has("historial_penal")).toBe(true);
    expect(index.get("g2")?.has("certificado_os10")).toBe(true);
    expect(prisma.opsDocumentoPersona.findMany).toHaveBeenCalledTimes(1);
  });

  it("rama unificada usa codigo de TipoDocumento y sin_clasificar si falta tipo", async () => {
    readsUnified.mockResolvedValue(true);
    vi.mocked(prisma.documentoEnlace.findMany).mockResolvedValue([
      { entityId: "g1", file: { tipo: { codigo: "historial_penal" } } },
      { entityId: "g1", file: { tipo: { codigo: "contrato_guardia" } } },
      { entityId: "g2", file: { tipo: null } },
    ] as never);

    const index = await getGuardiaDocTypeIndex("t1", ["g1", "g2"]);
    expect(index.get("g1")?.has("historial_penal")).toBe(true);
    expect(index.get("g1")?.has("contrato_guardia")).toBe(true);
    expect(index.get("g2")?.has("sin_clasificar_guardia")).toBe(true);
    expect(index.get("g2")?.has("historial_penal")).toBe(false);
    expect(prisma.documentoEnlace.findMany).toHaveBeenCalledTimes(1);
  });

  it("con lista vacía no consulta", async () => {
    const index = await getGuardiaDocTypeIndex("t1", []);
    expect(index.size).toBe(0);
    expect(readsUnified).not.toHaveBeenCalled();
  });
});
