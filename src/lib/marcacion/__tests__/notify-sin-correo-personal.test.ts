// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_MARCACION_CONFIG, parseMarcacionConfigValue } from "@/lib/ops-marcacion-config";
import { startOfDayChile } from "@/lib/dates-cl";
import { getUnifiedType } from "@/lib/notifications/catalog";

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  notify: vi.fn(),
  sendAlerta: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsMarcacion: {
      count: mocks.count,
    },
  },
}));

vi.mock("@/lib/notifications/notify", () => ({
  notify: mocks.notify,
}));

vi.mock("@/lib/marcacion-email", () => ({
  sendAlertaGuardiaSinCorreoPersonal: mocks.sendAlerta,
}));

import { notifyMarcacionSinCorreoPersonal } from "../notify-sin-correo-personal";

const BASE = {
  tenantId: "tenant-1",
  guardiaId: "guardia-1",
  installationId: "inst-1",
  installationName: "Mall Centro",
  guardiaName: "Ana Pérez",
  guardiaRut: "123456785",
  tipo: "entrada" as const,
  timestamp: new Date("2026-03-15T15:04:05.000Z"),
  hashIntegridad: "a".repeat(64),
  marcacionConfig: { ...DEFAULT_MARCACION_CONFIG },
};

describe("config alerta sin correo personal", () => {
  it("queda apagada y sin casillas si el JSON del tenant no trae los campos", () => {
    const cfg = parseMarcacionConfigValue(JSON.stringify({ toleranciaAtrasoMinutos: 10 }));
    expect(cfg.alertaSinCorreoPersonalEnabled).toBe(false);
    expect(cfg.alertaSinCorreoPersonalEmployerEmails).toEqual([]);
  });

  it("normaliza casillas de empresa (lowercase, regex, dedup)", () => {
    const cfg = parseMarcacionConfigValue(
      JSON.stringify({
        alertaSinCorreoPersonalEnabled: true,
        alertaSinCorreoPersonalEmployerEmails: ["Ops@Gard.cl", "ops@gard.cl", "bad", "central@gard.cl"],
      }),
    );
    expect(cfg.alertaSinCorreoPersonalEnabled).toBe(true);
    expect(cfg.alertaSinCorreoPersonalEmployerEmails).toEqual(["ops@gard.cl", "central@gard.cl"]);
  });
});

describe("catálogo marcacion_sin_correo_personal", () => {
  it("existe con campana por defecto y sin correo", () => {
    const typeDef = getUnifiedType("marcacion_sin_correo_personal");
    expect(typeDef).not.toBeNull();
    expect(typeDef?.module).toBe("ops");
    expect(typeDef?.submodule).toBe("marcaciones");
    expect(typeDef?.audiences).toEqual(["admin"]);
    expect(typeDef?.defaults.admin).toEqual({ bell: true, email: false, push: true });
  });
});

describe("notifyMarcacionSinCorreoPersonal", () => {
  beforeEach(() => {
    mocks.count.mockReset();
    mocks.notify.mockReset();
    mocks.sendAlerta.mockReset();
    mocks.notify.mockResolvedValue({ delivered: 1 });
    mocks.sendAlerta.mockResolvedValue(undefined);
  });

  it("dedup: no notifica ni envía correo si ya hay más de una marca del día", async () => {
    mocks.count.mockResolvedValue(2);
    await notifyMarcacionSinCorreoPersonal(BASE);
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.sendAlerta).not.toHaveBeenCalled();
  });

  it("con defaults notifica en campana y no envía Resend", async () => {
    mocks.count.mockResolvedValue(1);
    await notifyMarcacionSinCorreoPersonal(BASE);
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: BASE.tenantId,
        type: "marcacion_sin_correo_personal",
        link: "/ops/marcaciones",
      }),
    );
    expect(mocks.sendAlerta).not.toHaveBeenCalled();
  });

  it("con opt-in y casillas envía Resend solo a esas casillas", async () => {
    mocks.count.mockResolvedValue(1);
    await notifyMarcacionSinCorreoPersonal({
      ...BASE,
      marcacionConfig: {
        ...DEFAULT_MARCACION_CONFIG,
        alertaSinCorreoPersonalEnabled: true,
        alertaSinCorreoPersonalEmployerEmails: ["ops@empresa.cl"],
      },
    });
    expect(mocks.sendAlerta).toHaveBeenCalledTimes(1);
    expect(mocks.sendAlerta).toHaveBeenCalledWith(
      expect.objectContaining({
        employerEmails: ["ops@empresa.cl"],
        tenantId: BASE.tenantId,
      }),
    );
  });

  it("opt-in sin casillas no dispara Resend", async () => {
    mocks.count.mockResolvedValue(1);
    await notifyMarcacionSinCorreoPersonal({
      ...BASE,
      marcacionConfig: {
        ...DEFAULT_MARCACION_CONFIG,
        alertaSinCorreoPersonalEnabled: true,
        alertaSinCorreoPersonalEmployerEmails: [],
      },
    });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.sendAlerta).not.toHaveBeenCalled();
  });

  it("filtra el count por tenant, guardia, deletedAt y inicio del día Chile", async () => {
    mocks.count.mockResolvedValue(1);
    await notifyMarcacionSinCorreoPersonal(BASE);
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        tenantId: BASE.tenantId,
        guardiaId: BASE.guardiaId,
        deletedAt: null,
        timestamp: { gte: startOfDayChile(BASE.timestamp) },
      },
    });
  });

  it("no propaga errores al caller", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.count.mockRejectedValue(new Error("db down"));
    await expect(notifyMarcacionSinCorreoPersonal(BASE)).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
