import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  EXPORT_MAX_ROWS,
  accessExportFilename,
  buildAccessRecordsWhere,
  buildAccessRecordsWorkbook,
  formatAccessExportDate,
  mapAccessExportRow,
  slugInstallationName,
  stayDurationMinutes,
  type AccessExportRecord,
} from "@/lib/access-control/export";

const ENTRY = new Date("2026-08-30T15:00:00.000Z");
const EXIT = new Date("2026-08-30T17:30:00.000Z");

function record(overrides: Partial<AccessExportRecord> = {}): AccessExportRecord {
  return {
    recordType: "visit",
    rut: "93681460",
    fullName: "Ana Pérez, Ltda.",
    company: "ACME, \"Chile\"",
    entryAt: ENTRY,
    exitAt: EXIT,
    vehiclePlate: "ABCD12",
    ...overrides,
  };
}

describe("stayDurationMinutes", () => {
  it("redondea minutos enteros entre entrada y salida", () => {
    expect(stayDurationMinutes(ENTRY, EXIT)).toBe(150);
  });

  it("no entrega duración negativa si la salida es anterior a la entrada", () => {
    expect(stayDurationMinutes(EXIT, ENTRY)).toBe(0);
  });
});

describe("slugInstallationName / filename", () => {
  it("normaliza el nombre de instalación a slug ASCII", () => {
    expect(slugInstallationName("Mall Plaza Ñuñoa — Torre A")).toBe("mall-plaza-nunoa-torre-a");
  });

  it("usa inicio/hoy cuando faltan fechas", () => {
    const name = accessExportFilename("Faena Norte", null, "2026-08-30");
    expect(name).toBe("accesos_faena-norte_inicio_2026-08-30.xlsx");
  });

  it("toma YYYY-MM-DD aunque el query traiga timestamp", () => {
    expect(accessExportFilename("X", "2026-08-01T00:00:00.000Z", "2026-08-30")).toBe(
      "accesos_x_2026-08-01_2026-08-30.xlsx",
    );
  });
});

describe("formatAccessExportDate", () => {
  it("renderiza dd-mm-aaaa hh:mm en America/Santiago (24h)", () => {
    // 16:00 UTC en agosto (CLT, UTC-4) = 12:00 Chile
    expect(formatAccessExportDate(new Date("2026-08-30T16:00:00.000Z"))).toBe(
      "30-08-2026 12:00",
    );
  });

  it("usa 00:00 y no 24:00 tras medianoche Chile", () => {
    expect(formatAccessExportDate(new Date("2026-08-31T04:00:00.000Z"))).toBe(
      "31-08-2026 00:00",
    );
  });
});

describe("buildAccessRecordsWhere", () => {
  it("incluye tenantId e installationId", () => {
    const where = buildAccessRecordsWhere({
      tenantId: "t1",
      installationId: "i1",
    });
    expect(where).toMatchObject({ tenantId: "t1", installationId: "i1" });
  });

  it("busca RUT con guion contra el valor limpio persistido", () => {
    const where = buildAccessRecordsWhere({
      tenantId: "t1",
      installationId: "i1",
      search: "9368146-0",
    });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { rut: { contains: "9368146-0" } },
        { rut: { contains: "93681460" } },
        { company: { contains: "9368146-0", mode: "insensitive" } },
      ]),
    );
  });

  it("filtra en sitio, tipo y listMatch=none como el listado ops", () => {
    const where = buildAccessRecordsWhere({
      tenantId: "t1",
      installationId: "i1",
      status: "in_site",
      type: "visit",
      listMatch: "none",
      qrSource: "cedula_2024",
      guardId: "g1",
    });
    expect(where.exitAt).toBeNull();
    expect(where.recordType).toBe("visit");
    expect(where.listMatch).toBeNull();
    expect(where.qrSource).toBe("cedula_2024");
    expect(where.entryGuardId).toBe("g1");
  });
});

describe("mapAccessExportRow", () => {
  it("incluye duración numérica y legible cuando hay salida", () => {
    const row = mapAccessExportRow(record(), {});
    expect(row.tipo).toBe("Visita");
    expect(row.rut).toBe("9.368.146-0");
    expect(row.duracionMin).toBe(150);
    expect(row.duracion).toBe("2h 30m");
    expect(row.salida).not.toBe("En sitio");
  });

  it("deja duraciones vacías y Salida=En sitio si no hay exitAt", () => {
    const row = mapAccessExportRow(record({ exitAt: null }), {});
    expect(row.salida).toBe("En sitio");
    expect(row.duracionMin).toBe("");
    expect(row.duracion).toBe("");
  });

  it("resuelve label override y tipo custom", () => {
    expect(
      mapAccessExportRow(record({ recordType: "visit" }), {
        recordTypeLabels: { visit: "Visita contratista" },
      }).tipo,
    ).toBe("Visita contratista");

    expect(
      mapAccessExportRow(record({ recordType: "custom_abc1234" }), {
        customRecordTypes: [{ key: "custom_abc1234", label: "Contratista" }],
      }).tipo,
    ).toBe("Contratista");

    expect(mapAccessExportRow(record({ recordType: "unknown_key" }), {}).tipo).toBe(
      "unknown_key",
    );
  });
});

describe("buildAccessRecordsWorkbook", () => {
  it("escribe encabezados, todas las filas en orden recibido y columna Duración", async () => {
    const older = record({
      fullName: "Primero",
      entryAt: new Date("2026-08-01T12:00:00.000Z"),
      exitAt: new Date("2026-08-01T13:00:00.000Z"),
    });
    const newer = record({
      fullName: "Segundo",
      entryAt: new Date("2026-08-02T12:00:00.000Z"),
      exitAt: new Date("2026-08-02T13:00:00.000Z"),
    });

    const wb = await buildAccessRecordsWorkbook(
      [older, newer],
      {},
      { installationName: "Faena" },
    );
    const buf = await wb.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buf);

    const sheet = loaded.getWorksheet("Accesos");
    expect(sheet).toBeDefined();
    expect(loaded.getWorksheet("Aviso")).toBeUndefined();

    const headers = sheet!.getRow(1).values as unknown[];
    expect(headers).toEqual(
      expect.arrayContaining([
        "Tipo",
        "RUT",
        "Nombre",
        "Empresa",
        "Entrada",
        "Salida",
        "Duración (min)",
        "Duración",
        "Patente",
      ]),
    );

    expect(sheet!.rowCount).toBe(3);
    // Tras load() las keys de columna no se restauran: 3=Nombre, 7=Duración (min), 8=Duración
    expect(sheet!.getRow(2).getCell(3).value).toBe("Primero");
    expect(sheet!.getRow(3).getCell(3).value).toBe("Segundo");
    expect(sheet!.getRow(2).getCell(7).value).toBe(60);
    expect(sheet!.getRow(2).getCell(8).value).toBe("1h");
  });

  it("incluye las 120 filas de un RUT (más de una página de 50)", async () => {
    const records = Array.from({ length: 120 }, (_, i) =>
      record({
        fullName: `Persona ${i + 1}`,
        entryAt: new Date(Date.UTC(2026, 0, 1, 8, i)),
        exitAt: new Date(Date.UTC(2026, 0, 1, 10, i)),
      }),
    );
    const wb = await buildAccessRecordsWorkbook(records, {}, { installationName: "Faena" });
    expect(wb.getWorksheet("Accesos")?.rowCount).toBe(121);
  });

  it("exporta 0 filas con solo encabezados", async () => {
    const wb = await buildAccessRecordsWorkbook([], {}, { installationName: "X" });
    const sheet = wb.getWorksheet("Accesos");
    expect(sheet?.rowCount).toBe(1);
    expect(sheet?.getRow(1).getCell(1).value).toBe("Tipo");
  });

  it("agrega hoja Aviso cuando el total supera el techo", async () => {
    const wb = await buildAccessRecordsWorkbook(
      [record()],
      {},
      { installationName: "Faena Norte", truncatedTotal: EXPORT_MAX_ROWS + 5 },
    );
    const aviso = wb.getWorksheet("Aviso");
    expect(aviso).toBeDefined();
    const values = [2, 3, 4, 5].map((n) => String(aviso!.getRow(n).getCell(2).value));
    expect(values.join(" ")).toContain(String(EXPORT_MAX_ROWS + 5));
    expect(values.join(" ")).toMatch(/fechas/i);
  });
});
