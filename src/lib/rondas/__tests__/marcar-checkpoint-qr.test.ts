// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirstEjecucion: vi.fn(),
  findFirstCheckpoint: vi.fn(),
  transaction: vi.fn(),
  getFullAlertConfig: vi.fn(),
  getActiveTurnoId: vi.fn(),
  getPusherServer: vi.fn(),
  broadcastToPortalCliente: vi.fn(),
  evaluatePostMarkAlerts: vi.fn(),
  notifyCriticalAlert: vi.fn(),
  emitRondaStarted: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsRondaEjecucion: {
      findFirst: mocks.findFirstEjecucion,
      update: vi.fn(),
    },
    opsCheckpoint: {
      findFirst: mocks.findFirstCheckpoint,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/rondas/alert-config-service", () => ({
  getFullAlertConfig: mocks.getFullAlertConfig,
}));

vi.mock("@/lib/rondas/get-active-turno", () => ({
  getActiveTurnoId: mocks.getActiveTurnoId,
}));

vi.mock("@/lib/chat", () => ({
  getPusherServer: mocks.getPusherServer,
}));

vi.mock("@/lib/rondas/realtime-portal-cliente", () => ({
  broadcastToPortalCliente: mocks.broadcastToPortalCliente,
}));

vi.mock("@/lib/rondas/alert-engine", () => ({
  evaluatePostMarkAlerts: mocks.evaluatePostMarkAlerts,
}));

vi.mock("@/lib/rondas/alert-notifications", () => ({
  notifyCriticalAlert: mocks.notifyCriticalAlert,
}));

vi.mock("@/lib/rondas/lifecycle-notifications", () => ({
  emitRondaStarted: mocks.emitRondaStarted,
}));

vi.mock("next/server", () => ({
  after: (fn: () => void) => fn(),
}));

import {
  marcarCheckpoint,
  MarcarCheckpointError,
} from "../marcar-checkpoint-service";

const baseExecution = {
  id: "ej-1",
  tenantId: "tenant-1",
  guardiaId: "guard-1",
  status: "en_curso",
  startedAt: new Date("2026-01-01T10:00:00Z"),
  rondaTemplateId: "tpl-1",
  installationId: "inst-1",
  rondaTemplate: {
    qrRequerido: false,
    orderMode: "flexible",
    installationId: "inst-1",
    installation: { id: "inst-1" },
  },
  marcaciones: [],
};

const baseCheckpoint = {
  id: "cp-1",
  name: "Punto A",
  lat: -33.45,
  lng: -70.66,
  geoRadiusM: 5,
  verificationType: "QR",
  qrCode: "QR-ABC123",
};

function setupTransactionCreate(status: string) {
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      opsMarcacionCheckpoint: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "mark-1", status }),
        update: vi.fn(),
        count: vi.fn().mockResolvedValue(status === "COMPLETED" ? 1 : 0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      opsRondaCheckpoint: { count: vi.fn().mockResolvedValue(1) },
      opsRondaEjecucion: { update: vi.fn() },
      opsCheckpointTaskResponse: { createMany: vi.fn() },
      opsAlertaRonda: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn() },
    };
    return fn(tx);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findFirstEjecucion.mockResolvedValue(baseExecution);
  mocks.getFullAlertConfig.mockResolvedValue({});
  mocks.getActiveTurnoId.mockResolvedValue(null);
  mocks.getPusherServer.mockReturnValue({ trigger: vi.fn().mockResolvedValue(undefined) });
  mocks.broadcastToPortalCliente.mockResolvedValue(undefined);
  mocks.evaluatePostMarkAlerts.mockResolvedValue(undefined);
  mocks.notifyCriticalAlert.mockResolvedValue(undefined);
});

describe("marcarCheckpoint — validación QR y geocerca", () => {
  it("QR válido en punto QR fuera de radio → COMPLETED", async () => {
    mocks.findFirstCheckpoint.mockResolvedValue(baseCheckpoint);
    setupTransactionCreate("COMPLETED");

    const result = await marcarCheckpoint({
      ejecucionId: "ej-1",
      checkpointId: "cp-1",
      checkpointQrCode: "qr-abc123",
      lat: -33.5,
      lng: -70.7,
      gpsAccuracy: 800,
      guardiaId: "guard-1",
    });

    expect(result.geoNoVerificada).toBe(false);
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it("QR ausente en punto BOTH → qr_required", async () => {
    mocks.findFirstCheckpoint.mockResolvedValue({
      ...baseCheckpoint,
      verificationType: "BOTH",
    });

    await expect(
      marcarCheckpoint({
        ejecucionId: "ej-1",
        checkpointId: "cp-1",
        lat: -33.45,
        lng: -70.66,
        guardiaId: "guard-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "qr_required",
    } satisfies Partial<MarcarCheckpointError>);
  });

  it("QR de otro checkpoint → qr_mismatch", async () => {
    mocks.findFirstCheckpoint.mockResolvedValue({
      ...baseCheckpoint,
      verificationType: "BOTH",
    });

    await expect(
      marcarCheckpoint({
        ejecucionId: "ej-1",
        checkpointId: "cp-1",
        checkpointQrCode: "OTRO-CODIGO",
        lat: -33.45,
        lng: -70.66,
        guardiaId: "guard-1",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "qr_mismatch",
    });
  });

  it("QR embebido en URL coincide con el código del checkpoint", async () => {
    mocks.findFirstCheckpoint.mockResolvedValue(baseCheckpoint);
    setupTransactionCreate("COMPLETED");

    const result = await marcarCheckpoint({
      ejecucionId: "ej-1",
      checkpointId: "cp-1",
      checkpointQrCode: "https://example.test/ronda/QR-ABC123",
      lat: -33.5,
      lng: -70.7,
      gpsAccuracy: 800,
      guardiaId: "guard-1",
    });

    expect(result.geoNoVerificada).toBe(false);
    expect(mocks.transaction).toHaveBeenCalled();
  });

  it("lookup solo por QR usa comparación case-insensitive", async () => {
    mocks.findFirstCheckpoint.mockResolvedValue(baseCheckpoint);
    setupTransactionCreate("COMPLETED");

    await marcarCheckpoint({
      ejecucionId: "ej-1",
      checkpointQrCode: "qr-abc123",
      lat: -33.45,
      lng: -70.66,
      guardiaId: "guard-1",
    });

    expect(mocks.findFirstCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          qrCode: { equals: "QR-ABC123", mode: "insensitive" },
        }),
      }),
    );
  });

  it("QR/checkpoint ya marcado en la ronda → already_marked", async () => {
    mocks.findFirstCheckpoint.mockResolvedValue(baseCheckpoint);
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        opsMarcacionCheckpoint: {
          findFirst: vi.fn().mockResolvedValue({ id: "mark-prev", status: "COMPLETED" }),
          create: vi.fn(),
          update: vi.fn(),
          count: vi.fn(),
          findMany: vi.fn(),
        },
        opsRondaCheckpoint: { count: vi.fn() },
        opsRondaEjecucion: { update: vi.fn() },
        opsCheckpointTaskResponse: { createMany: vi.fn() },
        opsAlertaRonda: { findMany: vi.fn(), create: vi.fn() },
      };
      return fn(tx);
    });

    await expect(
      marcarCheckpoint({
        ejecucionId: "ej-1",
        checkpointId: "cp-1",
        checkpointQrCode: "QR-ABC123",
        lat: -33.45,
        lng: -70.66,
        guardiaId: "guard-1",
      }),
    ).rejects.toMatchObject({
      code: "already_marked",
      message: "Checkpoint ya marcado en esta ronda",
    });
  });

  it("punto GEOFENCE fuera de radio → GEO_NO_VERIFICADA", async () => {
    mocks.findFirstCheckpoint.mockResolvedValue({
      ...baseCheckpoint,
      verificationType: "GEOFENCE",
      qrCode: null,
    });
    setupTransactionCreate("GEO_NO_VERIFICADA");

    const result = await marcarCheckpoint({
      ejecucionId: "ej-1",
      checkpointId: "cp-1",
      lat: -33.5,
      lng: -70.7,
      gpsAccuracy: 10,
      guardiaId: "guard-1",
    });

    expect(result.geoNoVerificada).toBe(true);
  });
});
