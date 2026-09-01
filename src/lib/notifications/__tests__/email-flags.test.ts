import { describe, it, expect, vi, beforeEach } from "vitest";

const { toggleFindUniqueMock, settingFindFirstMock } = vi.hoisted(() => ({
  toggleFindUniqueMock: vi.fn(),
  settingFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tenantTransactionalEmailConfig: { findUnique: toggleFindUniqueMock },
    setting: { findFirst: settingFindFirstMock },
  },
}));

import { getOpsReportEmailFlags } from "../email-flags";

describe("getOpsReportEmailFlags", () => {
  beforeEach(() => {
    toggleFindUniqueMock.mockReset();
    settingFindFirstMock.mockReset();
    toggleFindUniqueMock.mockResolvedValue(null);
    settingFindFirstMock.mockResolvedValue(null);
  });

  it("todo habilitado por default (sin filas)", async () => {
    await expect(getOpsReportEmailFlags("t-1")).resolves.toEqual({
      coberturaSnapshot: true,
      reporteTurno: true,
      controlNocturno: true,
    });
  });

  it("apaga cobertura desde Correos automáticos", async () => {
    toggleFindUniqueMock.mockImplementation(async ({ where }: { where: { tenantId_kind: { kind: string } } }) => {
      if (where.tenantId_kind.kind === "cobertura_alert") return { enabled: false };
      return null;
    });

    const flags = await getOpsReportEmailFlags("t-1");
    expect(flags.coberturaSnapshot).toBe(false);
    expect(flags.reporteTurno).toBe(true);
    expect(flags.controlNocturno).toBe(true);
  });

  it("apaga reporte de turno si el Setting BLOQUE 9 está en false aunque el catálogo esté on", async () => {
    settingFindFirstMock.mockImplementation(async ({ where }: { where: { key: string } }) => {
      if (where.key === "reporteTurnoEmailEnabled") return { value: "false" };
      return null;
    });

    const flags = await getOpsReportEmailFlags("t-1");
    expect(flags.reporteTurno).toBe(false);
    expect(flags.coberturaSnapshot).toBe(true);
    expect(flags.controlNocturno).toBe(true);
  });

  it("apaga reporte de turno desde Correos automáticos", async () => {
    toggleFindUniqueMock.mockImplementation(async ({ where }: { where: { tenantId_kind: { kind: string } } }) => {
      if (where.tenantId_kind.kind === "rondas_monitor") return { enabled: false };
      return null;
    });

    const flags = await getOpsReportEmailFlags("t-1");
    expect(flags.reporteTurno).toBe(false);
  });
});
