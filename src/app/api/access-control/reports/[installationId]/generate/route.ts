import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "daily"; // daily | weekly | monthly

    const now = new Date();
    let from: Date;
    const to = new Date(now);
    to.setHours(23, 59, 59, 999);

    switch (type) {
      case "weekly": {
        from = new Date(now);
        from.setDate(from.getDate() - 7);
        from.setHours(0, 0, 0, 0);
        break;
      }
      case "monthly": {
        from = new Date(now);
        from.setMonth(from.getMonth() - 1);
        from.setHours(0, 0, 0, 0);
        break;
      }
      default: {
        from = new Date(now);
        from.setHours(0, 0, 0, 0);
        break;
      }
    }

    const [records, deniedAttempts, installation] = await Promise.all([
      prisma.accessControlRecord.findMany({
        where: {
          installationId,
          entryAt: { gte: from, lte: to },
        },
        orderBy: { entryAt: "asc" },
      }),
      prisma.accessControlDeniedAttempt.findMany({
        where: {
          installationId,
          attemptedAt: { gte: from, lte: to },
        },
      }),
      prisma.crmInstallation.findUnique({
        where: { id: installationId },
        select: { name: true },
      }),
    ]);

    const totalEntries = records.length;
    const totalExits = records.filter((r) => r.exitAt).length;
    const byType: Record<string, number> = {};
    let totalStayMinutes = 0;
    let completedCount = 0;

    for (const r of records) {
      byType[r.recordType] = (byType[r.recordType] || 0) + 1;
      if (r.exitAt) {
        totalStayMinutes += (r.exitAt.getTime() - r.entryAt.getTime()) / 60000;
        completedCount++;
      }
    }

    const report = {
      installationName: installation?.name || "Desconocida",
      period: type,
      from: from.toISOString(),
      to: to.toISOString(),
      generatedAt: new Date().toISOString(),
      summary: {
        totalEntries,
        totalExits,
        averageStayMinutes: completedCount > 0 ? Math.round(totalStayMinutes / completedCount) : 0,
        deniedAttempts: deniedAttempts.length,
        byType,
      },
      records: records.map((r) => ({
        id: r.id,
        recordType: r.recordType,
        rut: r.rut,
        fullName: r.fullName,
        company: r.company,
        entryAt: r.entryAt.toISOString(),
        exitAt: r.exitAt?.toISOString() || null,
        vehiclePlate: r.vehiclePlate,
      })),
      deniedAttempts: deniedAttempts.map((d) => ({
        rut: d.rut,
        fullName: d.fullName,
        blockReason: d.blockReason,
        attemptedAt: d.attemptedAt.toISOString(),
      })),
    };

    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    console.error("[AccessControl] Error generating report:", error);
    return NextResponse.json(
      { success: false, error: "Error al generar reporte" },
      { status: 500 }
    );
  }
}
