import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess, getMonthDateRange } from "@/lib/ops";

type ExecutionState = "asistio" | "te" | "sin_cobertura" | "ppc";

const SHIFT_LABELS: Record<string, string> = {
  T: "T",
  "-": "-",
  V: "V",
  L: "L",
  P: "P",
};

const SHIFT_FILLS: Record<string, string> = {
  T: "E8F8EE",
  "-": "E5E7EB",
  V: "DCFCE7",
  L: "FEF3C7",
  P: "FFEDD5",
};

const EXEC_BADGE: Record<ExecutionState, string> = {
  asistio: "ASI",
  te: "TE",
  sin_cobertura: "SC",
  ppc: "PPC",
};

function toDateKey(date: Date | string): string {
  if (typeof date === "string") return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= last; d += 1) {
    days.push(new Date(Date.UTC(year, month - 1, d)));
  }
  return days;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const installationId = request.nextUrl.searchParams.get("installationId") || undefined;
    const month = Number(request.nextUrl.searchParams.get("month") || new Date().getUTCMonth() + 1);
    const year = Number(request.nextUrl.searchParams.get("year") || new Date().getUTCFullYear());
    if (!installationId) {
      return NextResponse.json(
        { success: false, error: "installationId es requerido" },
        { status: 400 }
      );
    }

    const { start, end } = getMonthDateRange(year, month);
    const [installation, pauta, asignaciones, asistencia] = await Promise.all([
      prisma.crmInstallation.findFirst({
        where: { id: installationId, tenantId: ctx.tenantId },
        select: {
          id: true,
          name: true,
          account: { select: { name: true } },
        },
      }),
      prisma.opsPautaMensual.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          date: { gte: start, lte: end },
        },
        include: {
          puesto: {
            select: {
              id: true,
              name: true,
              shiftStart: true,
              shiftEnd: true,
              requiredGuards: true,
            },
          },
        },
        orderBy: [{ puestoId: "asc" }, { slotNumber: "asc" }, { date: "asc" }],
      }),
      prisma.opsAsignacionGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          isActive: true,
        },
        select: {
          puestoId: true,
          slotNumber: true,
          guardia: {
            select: { persona: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      prisma.opsAsistenciaDiaria.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          date: { gte: start, lte: end },
        },
        select: {
          puestoId: true,
          slotNumber: true,
          date: true,
          attendanceStatus: true,
          replacementGuardiaId: true,
        },
      }),
    ]);

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const executionByCell: Record<string, ExecutionState> = {};
    for (const row of asistencia) {
      const key = `${row.puestoId}|${row.slotNumber}|${toDateKey(row.date)}`;
      if (row.attendanceStatus === "reemplazo" && row.replacementGuardiaId) {
        executionByCell[key] = "te";
      } else if (row.attendanceStatus === "asistio") {
        executionByCell[key] = "asistio";
      } else if (row.attendanceStatus === "no_asistio") {
        executionByCell[key] = "sin_cobertura";
      } else if (row.attendanceStatus === "ppc") {
        executionByCell[key] = "ppc";
      }
    }

    const rows = new Map<
      string,
      {
        puestoId: string;
        puestoName: string;
        shiftStart: string;
        shiftEnd: string;
        slotNumber: number;
        guardiaName?: string;
        cells: Map<string, string>;
      }
    >();

    for (const item of pauta) {
      const key = `${item.puestoId}|${item.slotNumber}`;
      if (!rows.has(key)) {
        rows.set(key, {
          puestoId: item.puestoId,
          puestoName: item.puesto.name,
          shiftStart: item.puesto.shiftStart,
          shiftEnd: item.puesto.shiftEnd,
          slotNumber: item.slotNumber,
          cells: new Map(),
        });
      }
      rows.get(key)?.cells.set(toDateKey(item.date), item.shiftCode || "");
    }

    for (const a of asignaciones) {
      const key = `${a.puestoId}|${a.slotNumber}`;
      const row = rows.get(key);
      if (row) {
        row.guardiaName = `${a.guardia.persona.firstName} ${a.guardia.persona.lastName}`;
      }
    }

    const matrix = Array.from(rows.values()).sort((a, b) => {
      if (a.puestoName !== b.puestoName) return a.puestoName.localeCompare(b.puestoName);
      return a.slotNumber - b.slotNumber;
    });

    const monthDays = daysInMonth(year, month);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Pauta mensual");

    const totalColumns = 4 + monthDays.length;
    sheet.mergeCells(1, 1, 1, totalColumns);
    sheet.getCell(1, 1).value = "GARD · PAUTA MENSUAL";
    sheet.getCell(1, 1).font = { bold: true, size: 16 };
    sheet.getCell(1, 1).alignment = { horizontal: "center" };

    sheet.mergeCells(2, 1, 2, totalColumns);
    sheet.getCell(2, 1).value =
      `Cliente: ${installation.account?.name ?? "N/A"} | Instalación: ${installation.name} | Mes: ${month}/${year}`;
    sheet.getCell(2, 1).alignment = { horizontal: "center" };
    sheet.getCell(2, 1).font = { size: 11 };

    sheet.mergeCells(3, 1, 3, totalColumns);
    sheet.getCell(3, 1).value = "Doble capa: color = planificación | badge = ejecución real (ASI/TE/SC/PPC)";
    sheet.getCell(3, 1).alignment = { horizontal: "center" };
    sheet.getCell(3, 1).font = { italic: true, size: 10 };

    const header = ["Puesto", "Horario", "Slot", "Guardia", ...monthDays.map((d) => d.getUTCDate().toString())];
    sheet.addRow(header);
    const headerRow = sheet.getRow(4);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: "center", vertical: "middle" };
    headerRow.height = 22;

    matrix.forEach((row) => {
      const data: Array<string> = [
        row.puestoName,
        `${row.shiftStart}-${row.shiftEnd}`,
        `S${row.slotNumber}`,
        row.guardiaName ?? "Sin asignar",
      ];
      monthDays.forEach((d) => {
        const dateKey = toDateKey(d);
        const shiftCode = row.cells.get(dateKey) || "";
        const exec = executionByCell[`${row.puestoId}|${row.slotNumber}|${dateKey}`];
        const displayShift = SHIFT_LABELS[shiftCode] ?? shiftCode;
        data.push(exec ? `${displayShift || "·"} ${EXEC_BADGE[exec]}`.trim() : (displayShift || "·"));
      });
      sheet.addRow(data);
    });

    sheet.columns = [
      { width: 24 },
      { width: 14 },
      { width: 8 },
      { width: 22 },
      ...monthDays.map(() => ({ width: 5 })),
    ];

    for (let r = 5; r < 5 + matrix.length; r += 1) {
      for (let c = 5; c <= totalColumns; c += 1) {
        const dayIndex = c - 5;
        const dateKey = toDateKey(monthDays[dayIndex]);
        const rowData = matrix[r - 5];
        const shiftCode = rowData.cells.get(dateKey) || "";
        const fillColor = SHIFT_FILLS[shiftCode];
        if (fillColor) {
          sheet.getCell(r, c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: `FF${fillColor}` },
          };
        }
        sheet.getCell(r, c).alignment = { horizontal: "center" };
      }
    }

    for (let r = 4; r < 5 + matrix.length; r += 1) {
      for (let c = 1; c <= totalColumns; c += 1) {
        sheet.getCell(r, c).border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } },
        };
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `PautaMensual_${installation.name.replace(/\s+/g, "_")}_${year}-${String(month).padStart(2, "0")}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[OPS] Error exportando pauta mensual XLSX:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo exportar la pauta mensual en Excel" },
      { status: 500 }
    );
  }
}

