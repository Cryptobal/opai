import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const result = await safeAccessControlQuery(
      async () => {
        const [
          totalEntriesToday,
          totalExitsToday,
          inSiteRecords,
          byTypeResults,
        ] = await Promise.all([
          prisma.accessControlRecord.count({
            where: { installationId, entryAt: { gte: todayStart, lte: todayEnd } },
          }),
          prisma.accessControlRecord.count({
            where: { installationId, exitAt: { gte: todayStart, lte: todayEnd } },
          }),
          prisma.accessControlRecord.findMany({
            where: { installationId, exitAt: null },
            select: { recordType: true, entryAt: true },
          }),
          prisma.accessControlRecord.groupBy({
            by: ["recordType"],
            where: { installationId, entryAt: { gte: todayStart, lte: todayEnd } },
            _count: true,
          }),
        ]);

        const currentlyInSite = inSiteRecords.length;
        const currentVehiclesInSite = inSiteRecords.filter((r) => r.recordType === "vehicle").length;

        const completedToday = await prisma.accessControlRecord.findMany({
          where: {
            installationId,
            exitAt: { gte: todayStart, lte: todayEnd },
            NOT: { exitAt: null },
          },
          select: { entryAt: true, exitAt: true },
        });

        let averageStayMinutes = 0;
        if (completedToday.length > 0) {
          const totalMinutes = completedToday.reduce((sum, r) => {
            if (!r.exitAt) return sum;
            return sum + (r.exitAt.getTime() - r.entryAt.getTime()) / 60000;
          }, 0);
          averageStayMinutes = Math.round(totalMinutes / completedToday.length);
        }

        const byType: Record<string, number> = {};
        for (const r of byTypeResults) {
          byType[r.recordType] = r._count;
        }

        return {
          totalEntriesToday,
          totalExitsToday,
          currentlyInSite,
          currentVehiclesInSite,
          averageStayMinutes,
          byType,
        };
      },
      {
        totalEntriesToday: 0,
        totalExitsToday: 0,
        currentlyInSite: 0,
        currentVehiclesInSite: 0,
        averageStayMinutes: 0,
        byType: {},
      },
    );

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error("[AccessControl] Error fetching stats:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}
