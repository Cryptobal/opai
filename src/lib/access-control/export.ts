/**
 * Exportación server-side de registros de control de acceso (XLSX).
 *
 * La duración no se persiste: se deriva de entryAt/exitAt. Un registro
 * sin salida exporta "En sitio" y duraciones vacías (reporte determinista,
 * sin snapshot del momento de exportar).
 */

import type { Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { todayInChile } from "@/lib/dates-cl";
import { getRecordTypeLabel, type CustomRecordType } from "@/lib/access-control/types";
import { buildAccessRecordSearchOr, formatDuration, formatRut } from "@/lib/access-control/utils";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

export const EXPORT_MAX_ROWS = 20_000;

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type AccessExportRecord = {
  recordType: string;
  rut: string | null;
  fullName: string | null;
  company: string | null;
  entryAt: Date;
  exitAt: Date | null;
  vehiclePlate: string | null;
};

export type AccessExportLabelConfig = {
  customRecordTypes?: Array<Pick<CustomRecordType, "key" | "label">>;
  recordTypeLabels?: Partial<Record<string, string>>;
};

export type AccessExportMeta = {
  installationName: string;
  from?: string | null;
  to?: string | null;
  truncatedTotal?: number;
};

export type AccessRecordsFilterInput = {
  tenantId: string;
  installationId: string;
  status?: string | null;
  from?: string | null;
  to?: string | null;
  type?: string | null;
  search?: string | null;
  listMatch?: string | null;
  qrSource?: string | null;
  guardId?: string | null;
};

export type AccessExportRow = {
  tipo: string;
  rut: string;
  nombre: string;
  empresa: string;
  entrada: string;
  salida: string;
  duracionMin: number | "";
  duracion: string;
  patente: string;
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1A1F2E" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFF1F5F9" },
  size: 11,
};

const DATE_PARTS: Intl.DateTimeFormatOptions = {
  timeZone: "America/Santiago",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  hourCycle: "h23",
};

export function formatAccessExportDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", DATE_PARTS).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")} ${get("hour")}:${get("minute")}`;
}

/** Minutos enteros entre entrada y salida; nunca negativo. */
export function stayDurationMinutes(entryAt: Date, exitAt: Date): number {
  return Math.max(0, Math.round((exitAt.getTime() - entryAt.getTime()) / 60000));
}

export function slugInstallationName(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return slug || "instalacion";
}

function dateToken(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  return m ? m[1] : fallback;
}

export function accessExportFilename(
  installationName: string,
  from?: string | null,
  to?: string | null,
): string {
  const slug = slugInstallationName(installationName);
  const fromToken = dateToken(from, "inicio");
  const toToken = dateToken(to, todayInChile());
  return `accesos_${slug}_${fromToken}_${toToken}.xlsx`;
}

/**
 * Filtros del listado ops (status/from/to/type/search/listMatch/qrSource/guardId)
 * más tenantId como defensa en profundidad.
 */
export function buildAccessRecordsWhere(
  input: AccessRecordsFilterInput,
): Prisma.AccessControlRecordWhereInput {
  const where: Prisma.AccessControlRecordWhereInput = {
    tenantId: input.tenantId,
    installationId: input.installationId,
  };

  if (input.status === "in_site") {
    where.exitAt = null;
  }

  const entryAt: Prisma.DateTimeFilter = {};
  if (input.from) entryAt.gte = new Date(input.from);
  if (input.to) entryAt.lte = new Date(input.to);
  if (Object.keys(entryAt).length > 0) {
    where.entryAt = entryAt;
  }

  if (input.type) {
    where.recordType = input.type;
  }

  if (input.search) {
    where.OR = buildAccessRecordSearchOr(input.search, { includeCompany: true });
  }

  if (input.listMatch === "none") {
    where.listMatch = null;
  } else if (input.listMatch === "whitelist" || input.listMatch === "blacklist") {
    where.listMatch = input.listMatch;
  }
  if (input.qrSource) {
    where.qrSource = input.qrSource;
  }
  if (input.guardId) {
    where.entryGuardId = input.guardId;
  }

  return where;
}

export function parseRecordTypeLabels(value: unknown): Partial<Record<string, string>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Partial<Record<string, string>> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
  }
  return out;
}

export function mapAccessExportRow(
  record: AccessExportRecord,
  labelCfg: AccessExportLabelConfig,
): AccessExportRow {
  const tipo = getRecordTypeLabel(record.recordType, {
    recordTypeLabels: labelCfg.recordTypeLabels,
    customRecordTypes: labelCfg.customRecordTypes as CustomRecordType[] | undefined,
  });

  const hasExit = record.exitAt != null;
  const durationMin = hasExit ? stayDurationMinutes(record.entryAt, record.exitAt as Date) : null;

  return {
    tipo,
    rut: record.rut ? formatRut(record.rut) : "",
    nombre: record.fullName ?? "",
    empresa: record.company ?? "",
    entrada: formatAccessExportDate(record.entryAt),
    salida: hasExit ? formatAccessExportDate(record.exitAt as Date) : "En sitio",
    duracionMin: durationMin == null ? "" : durationMin,
    duracion: durationMin == null ? "" : formatDuration(durationMin),
    patente: record.vehiclePlate ?? "",
  };
}

export async function buildAccessRecordsWorkbook(
  records: AccessExportRecord[],
  labelCfg: AccessExportLabelConfig,
  meta: AccessExportMeta,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OPAI";
  wb.created = new Date();

  const ws = wb.addWorksheet("Accesos");
  ws.columns = [
    { header: "Tipo", key: "tipo", width: 18 },
    { header: "RUT", key: "rut", width: 16 },
    { header: "Nombre", key: "nombre", width: 28 },
    { header: "Empresa", key: "empresa", width: 24 },
    { header: "Entrada", key: "entrada", width: 20 },
    { header: "Salida", key: "salida", width: 20 },
    { header: "Duración (min)", key: "duracionMin", width: 16 },
    { header: "Duración", key: "duracion", width: 14 },
    { header: "Patente", key: "patente", width: 14 },
  ];
  const headerRow = ws.getRow(1);
  headerRow.font = HEADER_FONT;
  headerRow.fill = HEADER_FILL;
  headerRow.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  for (const record of records) {
    ws.addRow(mapAccessExportRow(record, labelCfg));
  }

  if (meta.truncatedTotal != null) {
    const aviso = wb.addWorksheet("Aviso");
    aviso.columns = [
      { header: "Campo", key: "campo", width: 48 },
      { header: "Valor", key: "valor", width: 72 },
    ];
    aviso.getRow(1).font = HEADER_FONT;
    aviso.getRow(1).fill = HEADER_FILL;
    aviso.addRows([
      { campo: "Instalación", valor: meta.installationName },
      { campo: "Total de registros que cumplen el filtro", valor: meta.truncatedTotal },
      { campo: "Filas exportadas", valor: records.length },
      {
        campo: "Aviso",
        valor:
          `Se exportaron los ${EXPORT_MAX_ROWS} registros más recientes del rango. ` +
          "Acota las fechas (o el RUT) para incluir el resto.",
      },
    ]);
  }

  return wb;
}

export async function runAccessRecordsExport(args: {
  tenantId: string;
  installationId: string;
  where: Prisma.AccessControlRecordWhereInput;
  from: string | null;
  to: string | null;
}): Promise<{ buffer: ExcelJS.Buffer; filename: string }> {
  const { tenantId, installationId, where, from, to } = args;

  const installation = await prisma.crmInstallation.findFirst({
    where: { id: installationId, tenantId },
    select: { name: true },
  });
  const installationName = installation?.name?.trim() || "Instalación";

  const [total, recordsDesc, config, customTypes] = await safeAccessControlQuery(
    () =>
      Promise.all([
        prisma.accessControlRecord.count({ where }),
        prisma.accessControlRecord.findMany({
          where,
          select: {
            recordType: true,
            rut: true,
            fullName: true,
            company: true,
            entryAt: true,
            exitAt: true,
            vehiclePlate: true,
          },
          orderBy: { entryAt: "desc" },
          take: EXPORT_MAX_ROWS,
        }),
        prisma.accessControlConfig.findUnique({
          where: { installationId },
          select: { recordTypeLabels: true },
        }),
        prisma.accessControlRecordType.findMany({
          where: { installationId },
          select: { key: true, label: true },
          orderBy: { orderIdx: "asc" },
        }),
      ]),
    [0, [], null, []] as [
      number,
      AccessExportRecord[],
      { recordTypeLabels: Prisma.JsonValue } | null,
      Array<{ key: string; label: string }>,
    ],
  );

  const records = [...recordsDesc].reverse();
  const truncatedTotal = total > EXPORT_MAX_ROWS ? total : undefined;

  const wb = await buildAccessRecordsWorkbook(
    records,
    {
      recordTypeLabels: parseRecordTypeLabels(config?.recordTypeLabels),
      customRecordTypes: customTypes,
    },
    { installationName, from, to, truncatedTotal },
  );

  const buffer = await wb.xlsx.writeBuffer();
  return { buffer, filename: accessExportFilename(installationName, from, to) };
}

export function accessExportHeaders(filename: string): Record<string, string> {
  return {
    "content-type": XLSX_CONTENT_TYPE,
    "content-disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
  };
}
