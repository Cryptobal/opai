import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {
      installationId,
      exitAt: null,
    };

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { rut: { contains: search } },
        { vehiclePlate: { contains: search, mode: "insensitive" } },
      ];
    }

    const records = await prisma.accessControlRecord.findMany({
      where,
      orderBy: { entryAt: "desc" },
    });

    // Compute counts
    const personCount = records.filter((r) => r.recordType !== "vehicle").length;
    const vehicleCount = records.filter((r) => r.recordType === "vehicle").length;

    return NextResponse.json({
      success: true,
      data: {
        records,
        personCount,
        vehicleCount,
        totalCount: records.length,
      },
    });
  } catch (error) {
    console.error("[AccessControl] Error fetching in-site records:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener registros en sitio" },
      { status: 500 }
    );
  }
}
