import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { GuardAttendanceRecord } from "@/lib/guard-portal";
import { ATTENDANCE_STATUS_LABELS } from "@/lib/guard-portal";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const guardiaId = searchParams.get("guardiaId");
    const month = searchParams.get("month"); // e.g. "2026-02"

    if (!guardiaId) {
      return NextResponse.json(
        { success: false, error: "guardiaId es requerido" },
        { status: 400 },
      );
    }

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, error: "month es requerido (formato YYYY-MM)" },
        { status: 400 },
      );
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    // Build date range for the month
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 0); // last day of month

    // Query asistencia records where this guard is planned, actual, or replacement
    const asistencias = await prisma.opsAsistenciaDiaria.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        OR: [
          { plannedGuardiaId: guardiaId },
          { actualGuardiaId: guardiaId },
        ],
      },
      include: {
        installation: { select: { name: true } },
      },
      orderBy: { date: "asc" },
    });

    // Map attendance status from DB format to portal format
    const statusMap: Record<string, GuardAttendanceRecord["status"]> = {
      presente: "present",
      ausente: "absent",
      atraso: "late",
      descanso: "rest",
      vacaciones: "vacation",
      licencia: "license",
      permiso: "permission",
      pendiente: "present", // pending defaults to present for display
    };

    const data: GuardAttendanceRecord[] = asistencias.map((a) => {
      const dateStr = a.date instanceof Date
        ? a.date.toISOString().split("T")[0]
        : String(a.date).split("T")[0];

      const rawStatus = a.attendanceStatus.toLowerCase();
      const status = statusMap[rawStatus] ?? "present";

      const entryTime = a.checkInAt instanceof Date
        ? a.checkInAt.toISOString().substring(11, 16) // HH:mm
        : null;
      const exitTime = a.checkOutAt instanceof Date
        ? a.checkOutAt.toISOString().substring(11, 16) // HH:mm
        : null;

      return {
        date: dateStr,
        status,
        statusLabel: ATTENDANCE_STATUS_LABELS[status]?.label ?? rawStatus,
        entryTime,
        exitTime,
        installationName: a.installation?.name ?? null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[Portal Guardia] Attendance error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener asistencia" },
      { status: 500 },
    );
  }
}
