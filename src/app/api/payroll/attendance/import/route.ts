/**
 * POST /api/payroll/attendance/import
 * Upload and parse a CR attendance CSV file.
 * Returns preview with matched/unmatched guards.
 * A second call to /import/[id]/apply actually creates the records.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, ensureModuleAccess } from "@/lib/api-auth";
import {
  parseCRAttendanceCSV,
  matchCRRowsToGuards,
  crRowToAttendanceData,
} from "@/lib/payroll/parsers/cr-attendance-parser";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbiddenMod = await ensureModuleAccess(ctx, "payroll");
    if (forbiddenMod) return forbiddenMod;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const periodId = formData.get("periodId") as string | null;

    if (!file || !periodId) {
      return NextResponse.json({ error: "file y periodId son requeridos" }, { status: 400 });
    }

    const period = await prisma.payrollPeriod.findFirst({
      where: { id: periodId, tenantId: ctx.tenantId },
    });
    if (!period) {
      return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });
    }

    // Read and parse CSV
    const csvContent = await file.text();
    const parsed = parseCRAttendanceCSV(csvContent);

    // Match against database
    const matchResult = await matchCRRowsToGuards(ctx.tenantId, parsed.rows);

    // Create import record
    const importRecord = await prisma.payrollAttendanceImport.create({
      data: {
        tenantId: ctx.tenantId,
        periodId,
        fileName: file.name,
        uploadedBy: ctx.userId,
        totalRows: parsed.rows.length,
        matchedRows: matchResult.matched.length,
        unmatchedRows: matchResult.unmatched.length,
        status: "PROCESSED",
        rawData: {
          year: parsed.year,
          month: parsed.month,
          dayColumns: parsed.dayColumns,
          matched: matchResult.matched.map((m) => ({
            guardiaId: m.guardiaId,
            guardiaName: m.guardiaName,
            rut: m.row.rutDv,
            nombre: m.row.nombre,
            ...crRowToAttendanceData(m.row, parsed.year, parsed.month, parsed.dayColumns),
          })),
          unmatched: matchResult.unmatched.map((u) => ({
            rut: u.rutDv,
            nombre: u.nombre,
            asistidos: u.asistidos,
            faltas: u.faltas,
          })),
        },
        processLog: {
          parsedAt: new Date().toISOString(),
          fileName: file.name,
          fileSize: file.size,
        },
      },
    });

    return NextResponse.json({
      data: {
        importId: importRecord.id,
        year: parsed.year,
        month: parsed.month,
        totalRows: parsed.rows.length,
        matched: matchResult.matched.map((m) => ({
          guardiaId: m.guardiaId,
          guardiaName: m.guardiaName,
          rut: m.row.rutDv,
          nombre: m.row.nombre,
          asistidos: m.row.asistidos,
          faltas: m.row.faltas,
          licencia: m.row.licencia,
          vacacion: m.row.vacacion,
          horasNormales: m.row.horasNormales,
        })),
        unmatched: matchResult.unmatched.map((u) => ({
          rut: u.rutDv,
          nombre: u.nombre,
          asistidos: u.asistidos,
        })),
      },
    });
  } catch (err: any) {
    console.error("[POST /api/payroll/attendance/import]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
