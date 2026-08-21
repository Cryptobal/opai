import { beforeEach, describe, expect, it, vi } from "vitest";

const findManyAsignacion = vi.fn();
const findManyGuardia = vi.fn();
const findManyPauta = vi.fn();
const findManyTurno = vi.fn();
const findManyAsistencia = vi.fn();
const findFirstPersona = vi.fn();
const transaction = vi.fn();
const updatePairing = vi.fn();
const createLog = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    opsAsignacionGuardia: { findMany: findManyAsignacion },
    opsGuardia: { findMany: findManyGuardia },
    opsPautaMensual: { findMany: findManyPauta },
    opsTurnoExtra: { findMany: findManyTurno },
    opsAsistenciaDiaria: { findMany: findManyAsistencia },
    opsPersona: { findFirst: findFirstPersona },
    devicePairing: { update: updatePairing },
    guardSelectionLog: { create: createLog },
    $transaction: transaction,
  },
}));

const { listDeviceGuards, pinMatches, rutLookupValues } = await import("../device-guards");

const ANA = {
  id: "g-ana",
  code: "A1",
  status: "active",
  isBlacklisted: false,
  persona: { firstName: "Ana", lastName: "Soto" },
};

beforeEach(() => {
  findManyAsignacion.mockReset().mockResolvedValue([]);
  findManyGuardia.mockReset().mockResolvedValue([]);
  findManyPauta.mockReset().mockResolvedValue([]);
  findManyTurno.mockReset().mockResolvedValue([]);
  findManyAsistencia.mockReset().mockResolvedValue([]);
  findFirstPersona.mockReset();
  transaction.mockReset();
  updatePairing.mockReset();
  createLog.mockReset();
});

describe("listDeviceGuards", () => {
  it("devuelve vacío si la instalación no tiene asignaciones ni pauta", async () => {
    const guards = await listDeviceGuards({
      tenantId: "t1",
      installationId: "inst-1",
    });
    expect(guards).toEqual([]);
    expect(findManyAsignacion).toHaveBeenCalled();
    expect(findManyPauta).toHaveBeenCalled();
  });

  it("une asignaciones, pauta, asistencia y turnos extra sin duplicar", async () => {
    findManyAsignacion.mockResolvedValue([{ guardia: ANA }]);
    findManyPauta.mockResolvedValue([
      { plannedGuardia: ANA, replacementGuardia: null },
    ]);
    findManyTurno.mockResolvedValue([
      {
        guardia: {
          id: "g-te",
          code: "TE1",
          status: "active",
          isBlacklisted: false,
          persona: { firstName: "Luis", lastName: "Perez" },
        },
      },
    ]);

    const guards = await listDeviceGuards({
      tenantId: "t1",
      installationId: "inst-1",
    });

    expect(guards.map((g) => g.id)).toEqual(["g-ana", "g-te"]);
    expect(guards[0]?.isTurnoExtra).toBe(false);
    expect(guards[1]?.isTurnoExtra).toBe(true);
    expect(guards[0]?.name).toBe("Soto Ana");
  });

  it("con query busca en el tenant y no consulta asignaciones", async () => {
    findManyGuardia.mockResolvedValue([ANA]);

    const guards = await listDeviceGuards({
      tenantId: "t1",
      installationId: "inst-1",
      query: "soto",
    });

    expect(guards).toHaveLength(1);
    expect(findManyAsignacion).not.toHaveBeenCalled();
    expect(findManyGuardia).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: "t1",
          status: "active",
        }),
        take: 40,
      }),
    );
  });

  it("omite query de 1 caracter y usa las fuentes locales", async () => {
    await listDeviceGuards({
      tenantId: "t1",
      installationId: "inst-1",
      query: "s",
    });
    expect(findManyAsignacion).toHaveBeenCalled();
  });

  it("consulta pauta y turnos extra con el día Chile, no medianoche UTC", async () => {
    // 02:30 UTC del 22 ago = 22:30 del 21 ago en Chile (UTC-4 en invierno)
    await listDeviceGuards({
      tenantId: "t1",
      installationId: "inst-1",
      now: new Date("2026-08-22T02:30:00.000Z"),
    });
    const pautaDate = findManyPauta.mock.calls[0]?.[0]?.where?.date as Date;
    const extraDate = findManyTurno.mock.calls[0]?.[0]?.where?.date as Date;
    expect(pautaDate.toISOString().slice(0, 10)).toBe("2026-08-21");
    expect(extraDate.toISOString().slice(0, 10)).toBe("2026-08-21");
  });
});

describe("pinMatches", () => {
  it("acepta PIN en texto plano y PIN visible", async () => {
    expect(await pinMatches("1234", "1234", null)).toBe(true);
    expect(await pinMatches("1234", null, "1234")).toBe(true);
    expect(await pinMatches("0000", "1234", "9999")).toBe(false);
    expect(await pinMatches("", "1234", "1234")).toBe(false);
  });

  it("acepta hash bcrypt", async () => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("1234", 4);
    expect(await pinMatches("1234", hash, null)).toBe(true);
    expect(await pinMatches("0000", hash, null)).toBe(false);
  });
});

describe("rutLookupValues", () => {
  it("incluye compacto y formato SII", () => {
    const values = rutLookupValues("11.111.111-1");
    expect(values).toContain("111111111");
    expect(values).toContain("11111111-1");
  });
});
