// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueQr = vi.fn();
const findUniqueInst = vi.fn();
const findUniqueTenant = vi.fn();
const findFirstQr = vi.fn();
const findFirstInst = vi.fn();
const findFirstLote = vi.fn();
const findManyLotes = vi.fn();
const aggregateQr = vi.fn();
const updateQr = vi.fn();
const updateInst = vi.fn();
const createEvent = vi.fn();
const deleteQr = vi.fn();
const deleteLote = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsReportQr: {
      findUnique: (...args: unknown[]) => findUniqueQr(...args),
      findFirst: (...args: unknown[]) => findFirstQr(...args),
      update: (...args: unknown[]) => updateQr(...args),
      aggregate: (...args: unknown[]) => aggregateQr(...args),
      delete: (...args: unknown[]) => deleteQr(...args),
    },
    opsReportQrLote: {
      findMany: (...args: unknown[]) => findManyLotes(...args),
      findFirst: (...args: unknown[]) => findFirstLote(...args),
      delete: (...args: unknown[]) => deleteLote(...args),
    },
    crmInstallation: {
      findUnique: (...args: unknown[]) => findUniqueInst(...args),
      findFirst: (...args: unknown[]) => findFirstInst(...args),
      update: (...args: unknown[]) => updateInst(...args),
    },
    tenant: { findUnique: (...args: unknown[]) => findUniqueTenant(...args) },
    opsReportQrEvent: { create: (...args: unknown[]) => createEvent(...args) },
    $transaction: (...args: unknown[]) => transaction(...args),
  },
}));

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/emails/site-url", () => ({ getCanonicalSiteUrl: () => "https://www.opai.cl" }));

import {
  assignReportQr,
  deleteReportQr,
  deleteReportQrLote,
  generateReportQrLote,
  lookupReportQr,
  retireReportQr,
  unassignReportQr,
} from "../report-qr";
import { resolveReportToken } from "../service";
import { IncidenteError } from "../errors";

const INST = {
  id: "inst-1",
  tenantId: "tenant-1",
  name: "Sede Centro",
  address: "Alameda 100",
  city: "Santiago",
  commune: "Santiago",
  lat: -33.4372,
  lng: -70.6506,
  geoRadiusM: 200,
  isActive: true,
  status: "active",
  publicReportEnabled: true,
  publicReportToken: "tok",
};

const QR_UNASSIGNED = {
  id: "qr-1",
  tenantId: "tenant-1",
  loteId: "lote-1",
  serial: 1,
  serialLabel: "QR-00001",
  token: "a".repeat(32),
  status: "unassigned",
  installationId: null,
  assignedAt: null,
  assignedBy: null,
  retiredAt: null,
  retiredBy: null,
  retiredReason: null,
  createdAt: new Date(),
  lote: { id: "lote-1", code: "L-202608-001" },
  installation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueTenant.mockResolvedValue({ name: "Gard" });
  findUniqueInst.mockResolvedValue(null);
});

describe("lookupReportQr", () => {
  it("missing si el token es corto o no existe", async () => {
    findUniqueQr.mockResolvedValue(null);
    expect(await lookupReportQr("short")).toEqual({ kind: "missing" });
    findUniqueQr.mockResolvedValue(null);
    expect(await lookupReportQr("x".repeat(20))).toEqual({ kind: "missing" });
  });

  it("unassigned si no tiene instalación", async () => {
    findUniqueQr.mockResolvedValue(QR_UNASSIGNED);
    const r = await lookupReportQr("x".repeat(20));
    expect(r.kind).toBe("unassigned");
    if (r.kind === "unassigned") expect(r.qr.serialLabel).toBe("QR-00001");
  });

  it("retired", async () => {
    findUniqueQr.mockResolvedValue({ ...QR_UNASSIGNED, status: "retired" });
    const r = await lookupReportQr("x".repeat(20));
    expect(r.kind).toBe("retired");
  });

  it("assigned carga la instalación", async () => {
    findUniqueQr.mockResolvedValue({
      ...QR_UNASSIGNED,
      status: "assigned",
      installationId: INST.id,
      installation: INST,
    });
    const r = await lookupReportQr("x".repeat(20));
    expect(r.kind).toBe("assigned");
    if (r.kind === "assigned") {
      expect(r.installation.name).toBe("Sede Centro");
      expect(r.installation.serialLabel).toBe("QR-00001");
    }
  });

  it("fallback a publicReportToken legado", async () => {
    findUniqueQr.mockResolvedValue(null);
    findUniqueInst.mockResolvedValue(INST);
    const r = await lookupReportQr("x".repeat(20));
    expect(r.kind).toBe("assigned");
    if (r.kind === "assigned") expect(r.qr.serialLabel).toBe("QR-LEGACY");
  });
});

describe("resolveReportToken", () => {
  it("QR_UNASSIGNED", async () => {
    findUniqueQr.mockResolvedValue(QR_UNASSIGNED);
    await expect(resolveReportToken("x".repeat(20))).rejects.toMatchObject({
      code: "QR_UNASSIGNED",
    } satisfies Partial<IncidenteError>);
  });

  it("TOKEN_INVALID si retired", async () => {
    findUniqueQr.mockResolvedValue({ ...QR_UNASSIGNED, status: "retired" });
    await expect(resolveReportToken("x".repeat(20))).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("CHANNEL_DISABLED si el canal está apagado", async () => {
    findUniqueQr.mockResolvedValue({
      ...QR_UNASSIGNED,
      status: "assigned",
      installationId: INST.id,
      installation: { ...INST, publicReportEnabled: false },
    });
    await expect(resolveReportToken("x".repeat(20))).rejects.toMatchObject({ code: "CHANNEL_DISABLED" });
  });

  it("ok si assigned y canal activo", async () => {
    findUniqueQr.mockResolvedValue({
      ...QR_UNASSIGNED,
      status: "assigned",
      installationId: INST.id,
      installation: INST,
    });
    const inst = await resolveReportToken("x".repeat(20));
    expect(inst.id).toBe("inst-1");
    expect(inst.serialLabel).toBe("QR-00001");
  });
});

describe("assign / unassign", () => {
  it("asigna un QR libre a una instalación con GPS", async () => {
    findFirstQr.mockResolvedValue(QR_UNASSIGNED);
    findFirstInst.mockResolvedValue(INST);
    const assignedRow = {
      ...QR_UNASSIGNED,
      status: "assigned",
      installationId: INST.id,
      installation: INST,
    };
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        opsReportQr: { update: vi.fn().mockResolvedValue(assignedRow) },
        opsReportQrEvent: { create: vi.fn() },
        crmInstallation: { update: vi.fn() },
      };
      return fn(tx);
    });
    const row = await assignReportQr({
      tenantId: "tenant-1",
      qrId: "qr-1",
      installationId: "inst-1",
      actorId: "user-1",
    });
    expect(row.status).toBe("assigned");
    expect(row.installationId).toBe("inst-1");
  });

  it("rechaza instalación sin GPS", async () => {
    findFirstQr.mockResolvedValue(QR_UNASSIGNED);
    findFirstInst.mockResolvedValue({ ...INST, lat: null, lng: null });
    await expect(
      assignReportQr({
        tenantId: "tenant-1",
        qrId: "qr-1",
        installationId: "inst-1",
        actorId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("no asigna un QR retirado", async () => {
    findFirstQr.mockResolvedValue({ ...QR_UNASSIGNED, status: "retired" });
    await expect(
      assignReportQr({
        tenantId: "tenant-1",
        qrId: "qr-1",
        installationId: "inst-1",
        actorId: "user-1",
      }),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("libera un QR asignado", async () => {
    const assigned = {
      ...QR_UNASSIGNED,
      status: "assigned",
      installationId: INST.id,
      installation: INST,
    };
    findFirstQr
      .mockResolvedValueOnce(assigned)
      .mockResolvedValueOnce(null);
    const freed = { ...QR_UNASSIGNED, status: "unassigned" };
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        opsReportQr: { update: vi.fn().mockResolvedValue(freed) },
        opsReportQrEvent: { create: vi.fn() },
      };
      return fn(tx);
    });
    updateInst.mockResolvedValue({});
    const row = await unassignReportQr({ tenantId: "tenant-1", qrId: "qr-1", actorId: "user-1" });
    expect(row.status).toBe("unassigned");
  });

  it("reasigna a otra instalación y registra reassign", async () => {
    const assigned = {
      ...QR_UNASSIGNED,
      status: "assigned",
      installationId: INST.id,
      installation: INST,
    };
    findFirstQr.mockResolvedValueOnce(assigned).mockResolvedValueOnce(null);
    findFirstInst.mockResolvedValue({ ...INST, id: "inst-2", name: "Sede Norte" });
    let eventAction: string | undefined;
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        opsReportQr: {
          update: vi.fn().mockResolvedValue({ ...assigned, installationId: "inst-2" }),
        },
        opsReportQrEvent: {
          create: vi.fn().mockImplementation(async ({ data }: { data: { action: string } }) => {
            eventAction = data.action;
          }),
        },
        crmInstallation: { update: vi.fn() },
      };
      return fn(tx);
    });
    updateInst.mockResolvedValue({});
    const row = await assignReportQr({
      tenantId: "tenant-1",
      qrId: "qr-1",
      installationId: "inst-2",
      actorId: "user-1",
    });
    expect(row.installationId).toBe("inst-2");
    expect(eventAction).toBe("reassign");
  });
});

describe("generateReportQrLote", () => {
  it("crea seriales consecutivos y tokens únicos", async () => {
    findManyLotes.mockResolvedValue([{ code: "L-202608-001" }]);
    aggregateQr.mockResolvedValue({ _max: { serial: 10 } });
    const createdSerials: number[] = [];
    const createdTokens: string[] = [];
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        opsReportQrLote: {
          create: vi.fn().mockResolvedValue({ id: "lote-2", code: "L-202608-002", quantity: 3 }),
        },
        opsReportQr: {
          create: vi.fn().mockImplementation(async ({ data }: { data: {
            serial: number;
            serialLabel: string;
            token: string;
            status: string;
          } }) => {
            createdSerials.push(data.serial);
            createdTokens.push(data.token);
            expect(data.status).toBe("unassigned");
            expect(data.serialLabel).toBe(`QR-${String(data.serial).padStart(5, "0")}`);
            return { id: `qr-${data.serial}`, serialLabel: data.serialLabel };
          }),
        },
      };
      return fn(tx);
    });
    const result = await generateReportQrLote({
      tenantId: "tenant-1",
      actorId: "user-1",
      quantity: 3,
    });
    expect(result.code).toBe("L-202608-002");
    expect(result.quantity).toBe(3);
    expect(createdSerials).toEqual([11, 12, 13]);
    expect(new Set(createdTokens).size).toBe(3);
    expect(createdTokens.every((t) => t.length >= 40)).toBe(true);
  });
});

describe("retireReportQr", () => {
  it("retira un QR asignado y lo desvincula de la instalación", async () => {
    const assigned = {
      ...QR_UNASSIGNED,
      status: "assigned",
      installationId: INST.id,
      installation: INST,
    };
    findFirstQr.mockResolvedValueOnce(assigned).mockResolvedValueOnce(null);
    const retired = {
      ...QR_UNASSIGNED,
      status: "retired",
      installationId: null,
      retiredReason: "Perdido",
    };
    let eventAction: string | undefined;
    transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        opsReportQr: { update: vi.fn().mockResolvedValue(retired) },
        opsReportQrEvent: {
          create: vi.fn().mockImplementation(async ({ data }: { data: { action: string } }) => {
            eventAction = data.action;
          }),
        },
      };
      return fn(tx);
    });
    updateInst.mockResolvedValue({});
    const row = await retireReportQr({
      tenantId: "tenant-1",
      qrId: "qr-1",
      actorId: "user-1",
      reason: "Perdido",
    });
    expect(row.status).toBe("retired");
    expect(row.installationId).toBeNull();
    expect(eventAction).toBe("retire");
  });
});

describe("deleteReportQr", () => {
  it("borra un QR sin asignar", async () => {
    findFirstQr.mockResolvedValue(QR_UNASSIGNED);
    deleteQr.mockResolvedValue(QR_UNASSIGNED);
    const result = await deleteReportQr({
      tenantId: "tenant-1",
      qrId: "qr-1",
      actorId: "user-1",
    });
    expect(result.serialLabel).toBe("QR-00001");
    expect(deleteQr).toHaveBeenCalledWith({ where: { id: "qr-1" } });
  });

  it("borra un QR retirado", async () => {
    findFirstQr.mockResolvedValue({ ...QR_UNASSIGNED, status: "retired" });
    deleteQr.mockResolvedValue({ ...QR_UNASSIGNED, status: "retired" });
    await deleteReportQr({ tenantId: "tenant-1", qrId: "qr-1", actorId: "user-1" });
    expect(deleteQr).toHaveBeenCalled();
  });

  it("rechaza un QR asignado", async () => {
    findFirstQr.mockResolvedValue({
      ...QR_UNASSIGNED,
      status: "assigned",
      installationId: INST.id,
    });
    await expect(
      deleteReportQr({ tenantId: "tenant-1", qrId: "qr-1", actorId: "user-1" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", httpStatus: 409 });
    expect(deleteQr).not.toHaveBeenCalled();
  });
});

describe("deleteReportQrLote", () => {
  it("borra el lote si no hay QR asignados", async () => {
    findFirstLote.mockResolvedValue({
      id: "lote-1",
      code: "L-202608-001",
      qrs: [
        { id: "qr-1", status: "unassigned" },
        { id: "qr-2", status: "retired" },
      ],
    });
    deleteLote.mockResolvedValue({});
    const result = await deleteReportQrLote({
      tenantId: "tenant-1",
      loteId: "lote-1",
      actorId: "user-1",
    });
    expect(result).toEqual({ loteId: "lote-1", code: "L-202608-001", deletedQrs: 2 });
    expect(deleteLote).toHaveBeenCalledWith({ where: { id: "lote-1" } });
  });

  it("rechaza un lote con QR asignados", async () => {
    findFirstLote.mockResolvedValue({
      id: "lote-1",
      code: "L-202608-001",
      qrs: [{ id: "qr-1", status: "assigned" }],
    });
    await expect(
      deleteReportQrLote({ tenantId: "tenant-1", loteId: "lote-1", actorId: "user-1" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", httpStatus: 409 });
    expect(deleteLote).not.toHaveBeenCalled();
  });

  it("404 si el lote no existe", async () => {
    findFirstLote.mockResolvedValue(null);
    await expect(
      deleteReportQrLote({ tenantId: "tenant-1", loteId: "lote-x", actorId: "user-1" }),
    ).rejects.toBeInstanceOf(IncidenteError);
    expect(deleteLote).not.toHaveBeenCalled();
  });
});
