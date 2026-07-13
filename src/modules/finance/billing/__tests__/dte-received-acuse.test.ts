import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDte: vi.fn(),
  updateDte: vi.fn(),
  findConfig: vi.fn(),
  findCert: vi.fn(),
  acuse: vi.fn(),
  accept: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    financeDte: { findFirst: mocks.findDte, update: mocks.updateDte },
    tenantDteConfig: { findUnique: mocks.findConfig },
    tenantDteCertificate: { findUnique: mocks.findCert },
  },
}));
vi.mock("@/lib/dte-encryption", () => ({
  decryptBuffer: vi.fn(() => Buffer.from("pfx")),
  decryptString: vi.fn(() => "secret"),
}));
vi.mock("@/modules/finance/shared/adapters/simpleapi-acuse", () => ({
  acuseRecibidoSimpleApi: mocks.acuse,
  acceptAndAcknowledge: mocks.accept,
}));

import { applyAcuse } from "../dte-received-acuse.service";

describe("applyAcuse DTE recibido", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findDte.mockResolvedValue({
      id: "dte-1",
      dteType: 33,
      folio: 574826,
      issuerRut: "12345678-5",
      issuerName: "Asociación Chilena de Seguridad",
      receptionStatus: "PENDING_REVIEW",
      receptionDeadline: new Date("2026-07-17T00:00:00.000Z"),
      notes: null,
    });
    mocks.findConfig.mockResolvedValue({ isActive: true, environment: "PRODUCTION" });
    mocks.findCert.mockResolvedValue({
      pfxDataEnc: Buffer.from("encrypted"),
      passwordEnc: "encrypted",
      rutTitular: "11111111-1",
      notAfter: new Date("2099-01-01T00:00:00.000Z"),
    });
    mocks.acuse.mockResolvedValue({ success: true, trackId: "track-1" });
    mocks.accept.mockResolvedValue({
      success: true,
      acdResult: { success: true, trackId: "acd-1" },
      ermResult: { success: true, trackId: "erm-1" },
    });
    mocks.updateDte.mockResolvedValue({});
  });

  it.each([
    ["CLAIM_CONTENT", "RCD", "CLAIMED", 1],
    ["CLAIM_PARTIAL", "RFP", "PARTIAL_CLAIM", 3],
    ["CLAIM_TOTAL", "RFT", "CLAIMED", 4],
  ] as const)("traduce %s a %s y persiste el estado", async (action, siiAction, status, claimType) => {
    const result = await applyAcuse("tenant-1", "admin-1", {
      dteId: "dte-1",
      action,
      notifySii: true,
    });

    expect(result.success).toBe(true);
    expect(mocks.acuse).toHaveBeenCalledWith(
      { dteType: 33, folio: 574826, accion: siiAction },
      expect.objectContaining({ rutEmpresa: "12345678-5", environment: "PRODUCTION" }),
    );
    expect(mocks.updateDte).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ receptionStatus: status, claimType }),
      }),
    );
  });

  it("acepta mediante ACD + ERM y habilita el crédito IVA", async () => {
    const result = await applyAcuse("tenant-1", "admin-1", {
      dteId: "dte-1",
      action: "ACCEPT",
      notifySii: true,
    });

    expect(result.success).toBe(true);
    expect(mocks.accept).toHaveBeenCalledWith(
      { dteType: 33, folio: 574826 },
      expect.objectContaining({ rutEmpresa: "12345678-5" }),
    );
    expect(mocks.updateDte).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ receptionStatus: "ACCEPTED", claimType: null }),
      }),
    );
  });

  it("no cambia OPAI cuando SimpleAPI rechaza el reclamo", async () => {
    mocks.acuse.mockResolvedValue({ success: false, error: "SII rechazó la acción" });

    const result = await applyAcuse("tenant-1", "admin-1", {
      dteId: "dte-1",
      action: "CLAIM_TOTAL",
      notifySii: true,
    });

    expect(result.success).toBe(false);
    expect(mocks.updateDte).not.toHaveBeenCalled();
  });
});
