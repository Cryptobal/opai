import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { installationId } = await params;

    if (!session.installations.some((i) => i.id === installationId)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const type = searchParams.get("type");

    const where: Record<string, unknown> = {
      installationId,
      exitAt: null,
    };

    if (type) {
      where.recordType = type;
    }

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
      select: {
        id: true,
        recordType: true,
        rut: true,
        fullName: true,
        company: true,
        entryAt: true,
        vehiclePlate: true,
        vehicleType: true,
        vehicleBrandModel: true,
        customFields: true,
      },
    });

    const personCount = records.filter((r) => r.recordType !== "vehicle").length;
    const vehicleCount = records.filter((r) => r.recordType === "vehicle").length;

    return NextResponse.json({
      success: true,
      data: { records, personCount, vehicleCount, totalCount: records.length },
    });
  } catch (error) {
    console.error("[ClientPortal] Error fetching live access control:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener datos en vivo" },
      { status: 500 }
    );
  }
}
