/**
 * Parser for "Asistencias mensuales CR" CSV format.
 * Semicolon-delimited with dynamic day columns and summary columns.
 *
 * Daily codes mapping:
 *   AS  -> ASISTIO (worked)
 *   +   -> DESCANSO (day off)
 *   -   -> NO_APLICA (not applicable / not hired yet)
 *   F   -> FALTA (unexcused absence - deducts salary)
 *   LME -> LICENCIA_MEDICA (medical leave - no deduction)
 *   V1  -> VACACION (vacation - no deduction)
 *   P1, P2 -> PERMISO_SIN_GOCE (unpaid leave - deducts salary)
 *   CA  -> CAMBIO (controlled absence - not a fault)
 *   SA  -> SIN_ASISTENCIA (absence marker - treated as fault)
 */

import { prisma } from "@/lib/prisma";

export interface CRAttendanceRow {
  rut: string;
  rutDv: string;
  nombre: string;
  fechaIngreso: string;
  fechaUltDia: string;
  fechaFiniquito: string;
  tipoEmpleado: string;
  ccActual: string;
  clienteActual: string;
  sectorActual: string;
  instalacionActual: string;
  dailyCodes: Record<string, string>; // date -> code
  turnosEnRol: number;
  turnosSinRol: number;
  asistidos: number;
  faltas: number;
  sinControlar: number;
  licencia: number;
  permisoSG: number;
  vacacion: number;
  faltasConsecutivas: number;
  domingosPlani: number;
  domingosTrab: number;
  horasNormales: number;
  horasColacion: number;
  horasExtPact: number;
  horasExtReemplazo: number;
  horasAtrasos: number;
  horasRecargoLegal: number;
  horasTVF: number;
}

export interface CRParseResult {
  rows: CRAttendanceRow[];
  year: number;
  month: number;
  dayColumns: string[]; // date strings for each day column
}

export interface CRMatchResult {
  matched: Array<{
    row: CRAttendanceRow;
    guardiaId: string;
    guardiaName: string;
  }>;
  unmatched: CRAttendanceRow[];
}

function parseDecimal(val: string): number {
  if (!val || val.trim() === "") return 0;
  return parseFloat(val.replace(",", ".")) || 0;
}

function parseInt2(val: string): number {
  if (!val || val.trim() === "") return 0;
  return parseInt(val, 10) || 0;
}

/**
 * Parse a CR attendance CSV string into structured rows.
 */
export function parseCRAttendanceCSV(csvContent: string): CRParseResult {
  const lines = csvContent.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV vacío o sin datos");

  // Parse header to find day columns
  const headerCols = lines[0].split(";");

  // Find day columns: they match DD-MM-YYYY pattern
  const dayColumnIndices: number[] = [];
  const dayDates: string[] = [];
  const datePattern = /^(\d{2})-(\d{2})-(\d{4})$/;

  for (let i = 0; i < headerCols.length; i++) {
    const match = headerCols[i].trim().match(datePattern);
    if (match) {
      dayColumnIndices.push(i);
      const [, dd, mm, yyyy] = match;
      dayDates.push(`${yyyy}-${mm}-${dd}`);
    }
  }

  if (dayDates.length === 0) throw new Error("No se encontraron columnas de días en el CSV");

  // Determine year and month from first date
  const firstDate = dayDates[0];
  const year = parseInt(firstDate.slice(0, 4), 10);
  const month = parseInt(firstDate.slice(5, 7), 10);

  // Summary columns come after the last day column
  const summaryStart = dayColumnIndices[dayColumnIndices.length - 1] + 1;

  const rows: CRAttendanceRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (!cols[0] || cols[0].trim() === "") continue; // skip empty rows

    const dailyCodes: Record<string, string> = {};
    for (let j = 0; j < dayColumnIndices.length; j++) {
      const val = (cols[dayColumnIndices[j]] || "").trim();
      if (val) dailyCodes[dayDates[j]] = val;
    }

    rows.push({
      rut: (cols[0] || "").trim(),
      rutDv: (cols[1] || "").trim(),
      nombre: (cols[2] || "").trim(),
      fechaIngreso: (cols[3] || "").trim(),
      fechaUltDia: (cols[4] || "").trim(),
      fechaFiniquito: (cols[5] || "").trim(),
      tipoEmpleado: (cols[6] || "").trim(),
      ccActual: (cols[7] || "").trim(),
      clienteActual: (cols[8] || "").trim(),
      sectorActual: (cols[9] || "").trim(),
      instalacionActual: (cols[10] || "").trim(),
      dailyCodes,
      turnosEnRol: parseInt2(cols[summaryStart] || ""),
      turnosSinRol: parseInt2(cols[summaryStart + 1] || ""),
      asistidos: parseInt2(cols[summaryStart + 2] || ""),
      faltas: parseInt2(cols[summaryStart + 3] || ""),
      sinControlar: parseInt2(cols[summaryStart + 4] || ""),
      licencia: parseInt2(cols[summaryStart + 5] || ""),
      permisoSG: parseInt2(cols[summaryStart + 6] || ""),
      vacacion: parseInt2(cols[summaryStart + 7] || ""),
      faltasConsecutivas: parseInt2(cols[summaryStart + 8] || ""),
      domingosPlani: parseInt2(cols[summaryStart + 9] || ""),
      domingosTrab: parseInt2(cols[summaryStart + 10] || ""),
      horasNormales: parseDecimal(cols[summaryStart + 11] || ""),
      horasColacion: parseDecimal(cols[summaryStart + 12] || ""),
      horasExtPact: parseDecimal(cols[summaryStart + 13] || ""),
      horasExtReemplazo: parseDecimal(cols[summaryStart + 14] || ""),
      horasAtrasos: parseDecimal(cols[summaryStart + 15] || ""),
      horasRecargoLegal: parseDecimal(cols[summaryStart + 16] || ""),
      horasTVF: parseDecimal(cols[summaryStart + 17] || ""),
    });
  }

  return { rows, year, month, dayColumns: dayDates };
}

/**
 * Match parsed CR rows against guards in the database by RUT.
 */
export async function matchCRRowsToGuards(
  tenantId: string,
  rows: CRAttendanceRow[]
): Promise<CRMatchResult> {
  // Get all personas with their RUTs
  const personas = await prisma.opsPersona.findMany({
    where: { tenantId, status: "active" },
    select: {
      rut: true,
      firstName: true,
      lastName: true,
      guardia: { select: { id: true } },
    },
  });

  // Build RUT lookup (normalize: remove dots, dashes, leading zeros)
  const rutMap = new Map<string, { guardiaId: string; name: string }>();
  for (const p of personas) {
    if (!p.rut || !p.guardia) continue;
    const normalized = normalizeRut(p.rut);
    rutMap.set(normalized, {
      guardiaId: p.guardia.id,
      name: `${p.firstName} ${p.lastName}`,
    });
  }

  const matched: CRMatchResult["matched"] = [];
  const unmatched: CRAttendanceRow[] = [];

  for (const row of rows) {
    const normalized = normalizeRut(row.rut);
    const found = rutMap.get(normalized);
    if (found) {
      matched.push({
        row,
        guardiaId: found.guardiaId,
        guardiaName: found.name,
      });
    } else {
      unmatched.push(row);
    }
  }

  return { matched, unmatched };
}

/**
 * Convert a matched CR row to a PayrollAttendanceRecord-compatible object.
 */
export function crRowToAttendanceData(
  row: CRAttendanceRow,
  year: number,
  month: number,
  dayDates: string[]
) {
  const dailyDetail = dayDates.map((date) => {
    const code = row.dailyCodes[date] || "-";
    return { date, code, checkIn: null, checkOut: null };
  });

  // Calculate effective days (days that count for salary)
  // Days worked = asistidos from CR
  // Days absent (faltas) = deducts
  // Medical leave = doesn't deduct
  // Vacation = doesn't deduct
  // Unpaid leave = deducts
  const totalDaysMonth = new Date(year, month, 0).getDate();

  return {
    source: "IMPORT" as const,
    year,
    month,
    daysWorked: row.asistidos,
    daysAbsent: row.faltas,
    daysMedicalLeave: row.licencia,
    daysVacation: row.vacacion,
    daysUnpaidLeave: row.permisoSG,
    totalDaysMonth,
    scheduledDays: row.turnosEnRol,
    sundaysWorked: row.domingosTrab,
    sundaysScheduled: row.domingosPlani,
    normalHours: row.horasNormales,
    overtimeHours50: row.horasExtPact,
    overtimeHours100: row.horasExtReemplazo,
    lateHours: row.horasAtrasos,
    dailyDetail,
  };
}

/**
 * Normalize a RUT to just the base number (without DV, dots, or dashes).
 * "17.385.726-8" -> "17385726"
 * "17385726-8"   -> "17385726"
 * "17385726"     -> "17385726"
 */
function normalizeRut(rut: string): string {
  const cleaned = rut.replace(/\./g, "").replace(/\s/g, "").trim();
  // Remove DV (everything after the dash)
  const basePart = cleaned.includes("-") ? cleaned.split("-")[0] : cleaned;
  return basePart.replace(/^0+/, "");
}
