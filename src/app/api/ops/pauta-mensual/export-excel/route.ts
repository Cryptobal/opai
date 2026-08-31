import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import {
  buildExecutionMap,
  createOpsAuditLog,
  ensureOpsAccess,
  getMonthDateRange,
  toDateKeyUTC,
  type ExecutionState,
} from "@/lib/ops";
import { getTenantCompanyConfig } from "@/lib/tenant-config";
import { formatPersonName } from "@/lib/personas";
import { todayInChile } from "@/lib/dates-cl";
import { solapaRangoWhere } from "@/lib/ops/asignacion-vigencia-db";
import {
  resolvePautaCellState,
  resolveSlotHeader,
  slotHeaderExportLabel,
  type GhostAsignacion,
} from "@/lib/ops/pauta-cell-state";

const SHIFT_LABELS: Record<string, string> = {
  T: "T",
  "-": "-",
  V: "V",
  L: "L",
  P: "P",
  PCG: "PCG",
  PSG: "PSG",
  F: "F",
  CI: "CI",
  CP: "CP",
  DES: "DES",
  PR: "PR",
  PPC: "PPC",
};

const SHIFT_FILLS: Record<string, string> = {
  T: "E8F8EE",
  "-": "E5E7EB",
  V: "DCFCE7",
  L: "FEF3C7",
  P: "FFEDD5",
  PCG: "FEF3C7",
  PSG: "FFEDD5",
  F: "FECACA",
  CI: "E0E7FF",
  CP: "E0E7FF",
  DES: "E5E7EB",
  PR: "DBEAFE",
  PPC: "D4D4D8",
};

const EXEC_BADGE: Record<ExecutionState, string> = {
  asistio: "ASI",
  te: "TE",
  sin_cobertura: "SC",
  ppc: "PPC",
};

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
    const forbidden = await ensureOpsAccess(ctx);
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
              cargo: { select: { name: true } },
              puestoTrabajo: { select: { name: true } },
            },
          },
          previousGuardia: {
            select: { persona: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: [{ puestoId: "asc" }, { slotNumber: "asc" }, { date: "asc" }],
      }),
      prisma.opsAsignacionGuardia.findMany({
        where: {
          tenantId: ctx.tenantId,
          installationId,
          ...solapaRangoWhere(start, end),
        },
        select: {
          puestoId: true,
          slotNumber: true,
          startDate: true,
          endDate: true,
          guardia: {
            select: {
              id: true,
              terminatedAt: true,
              persona: { select: { firstName: true, lastName: true } },
            },
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
          plannedGuardiaId: true,
          actualGuardiaId: true,
          replacementGuardiaId: true,
          turnosExtra: { select: { id: true, status: true } },
        },
      }),
    ]);

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    // Tenant branding
    const cfg = await getTenantCompanyConfig(ctx.tenantId);

    // Lógica canónica de ejecución compartida (ops.ts)
    const executionMap = buildExecutionMap(asistencia);

    const ghostIds = [
      ...new Set(
        pauta
          .filter((i) => !i.plannedGuardiaId && i.previousGuardiaId)
          .map((i) => i.previousGuardiaId as string),
      ),
    ];
    const ghostAsignaciones =
      ghostIds.length > 0
        ? await prisma.opsAsignacionGuardia.findMany({
            where: {
              tenantId: ctx.tenantId,
              guardiaId: { in: ghostIds },
              ...solapaRangoWhere(start, end),
            },
            select: {
              guardiaId: true,
              startDate: true,
              endDate: true,
              installationId: true,
              installation: { select: { name: true } },
              puesto: { select: { name: true } },
            },
          })
        : [];
    const ghostAsigsByGuardia = new Map<string, GhostAsignacion[]>();
    for (const a of ghostAsignaciones) {
      const list = ghostAsigsByGuardia.get(a.guardiaId) ?? [];
      list.push({
        startDate: a.startDate,
        endDate: a.endDate,
        installationId: a.installationId,
        installationName: a.installation.name,
        puestoName: a.puesto.name,
      });
      ghostAsigsByGuardia.set(a.guardiaId, list);
    }

    type CellInfo = {
      shiftCode: string;
      plannedGuardiaId: string | null;
      previousGuardiaId: string | null;
      previousGuardiaName: string | null;
      unassignedReason: string | null;
      unassignedAt: Date | null;
    };
    const rows = new Map<
      string,
      {
        puestoId: string;
        puestoName: string;
        shiftStart: string;
        shiftEnd: string;
        slotNumber: number;
        guardiaName?: string;
        cells: Map<string, CellInfo>;
      }
    >();

    for (const item of pauta) {
      const key = `${item.puestoId}|${item.slotNumber}`;
      if (!rows.has(key)) {
        const displayName = [
          (item.puesto as any).cargo?.name,
          (item.puesto as any).puestoTrabajo?.name,
        ].filter(Boolean).join(" - ") || item.puesto.name;
        rows.set(key, {
          puestoId: item.puestoId,
          puestoName: displayName,
          shiftStart: item.puesto.shiftStart,
          shiftEnd: item.puesto.shiftEnd,
          slotNumber: item.slotNumber,
          cells: new Map(),
        });
      }
      rows.get(key)?.cells.set(toDateKeyUTC(item.date), {
        shiftCode: item.shiftCode || "",
        plannedGuardiaId: item.plannedGuardiaId,
        previousGuardiaId: item.previousGuardiaId,
        previousGuardiaName: item.previousGuardia
          ? formatPersonName(item.previousGuardia.persona.firstName, item.previousGuardia.persona.lastName)
          : null,
        unassignedReason: item.unassignedReason,
        unassignedAt: item.unassignedAt,
      });
    }

    const monthStartKey = toDateKeyUTC(start);
    const monthEndKey = toDateKeyUTC(end);
    const todayKey = todayInChile();
    const asignacionesBySlot = new Map<string, typeof asignaciones>();
    for (const a of asignaciones) {
      const key = `${a.puestoId}|${a.slotNumber}`;
      const list = asignacionesBySlot.get(key) ?? [];
      list.push(a);
      asignacionesBySlot.set(key, list);
    }
    for (const [key, row] of rows) {
      const list = (asignacionesBySlot.get(key) ?? []).map((a) => ({
        guardiaId: a.guardia.id,
        name: formatPersonName(a.guardia.persona.firstName, a.guardia.persona.lastName),
        startDate: a.startDate,
        endDate: a.endDate,
        terminatedAt: a.guardia.terminatedAt,
      }));
      const ghostCell = Array.from(row.cells.values()).find(
        (c) => c.previousGuardiaId && !c.plannedGuardiaId,
      );
      const ghost = ghostCell?.previousGuardiaId
        ? {
            guardiaId: ghostCell.previousGuardiaId,
            name: ghostCell.previousGuardiaName ?? "Guardia",
            reason: ghostCell.unassignedReason,
          }
        : null;
      row.guardiaName = slotHeaderExportLabel(
        resolveSlotHeader({
          asignaciones: list,
          ghost,
          monthStartKey,
          monthEndKey,
          todayKey,
        }),
      );
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
    sheet.getCell(1, 1).value = `${cfg.brandNameUpper} · PAUTA MENSUAL`;
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
        const dateKey = toDateKeyUTC(d);
        const cell = row.cells.get(dateKey);
        const state = cell
          ? resolvePautaCellState({
              dateKey,
              shiftCode: cell.shiftCode,
              plannedGuardiaId: cell.plannedGuardiaId,
              previousGuardiaId: cell.previousGuardiaId,
              previousGuardiaName: cell.previousGuardiaName,
              unassignedReason: cell.unassignedReason,
              unassignedAt: cell.unassignedAt,
              ghostAsignaciones: cell.previousGuardiaId
                ? (ghostAsigsByGuardia.get(cell.previousGuardiaId) ?? [])
                : [],
              currentInstallationId: installationId,
            })
          : null;
        const shiftCode = state?.code || cell?.shiftCode || "";
        const execResult = executionMap[`${row.puestoId}|${row.slotNumber}|${dateKey}`];
        const exec = execResult?.state;
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
        const dateKey = toDateKeyUTC(monthDays[dayIndex]);
        const rowData = matrix[r - 5];
        const cell = rowData.cells.get(dateKey);
        const state = cell
          ? resolvePautaCellState({
              dateKey,
              shiftCode: cell.shiftCode,
              plannedGuardiaId: cell.plannedGuardiaId,
              previousGuardiaId: cell.previousGuardiaId,
              previousGuardiaName: cell.previousGuardiaName,
              unassignedReason: cell.unassignedReason,
              unassignedAt: cell.unassignedAt,
              ghostAsignaciones: cell.previousGuardiaId
                ? (ghostAsigsByGuardia.get(cell.previousGuardiaId) ?? [])
                : [],
              currentInstallationId: installationId,
            })
          : null;
        const shiftCode = state?.code || cell?.shiftCode || "";
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

    // Audit: log export access
    await createOpsAuditLog(ctx, "ops.pauta.export_excel", "ops_pauta", installationId, {
      month,
      year,
      installationName: installation.name,
      rowCount: matrix.length,
    });

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

