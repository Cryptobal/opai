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
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const where: Record<string, unknown> = { installationId };

    if (from) where.entryAt = { ...(where.entryAt as object || {}), gte: new Date(from) };
    if (to) where.entryAt = { ...(where.entryAt as object || {}), lte: new Date(to) };
    if (type) where.recordType = type;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { rut: { contains: search } },
        { company: { contains: search, mode: "insensitive" } },
        { vehiclePlate: { contains: search, mode: "insensitive" } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.accessControlRecord.findMany({
        where,
        orderBy: { entryAt: "desc" },
        take: limit,
        skip: (page - 1) * limit,
        select: {
          id: true,
          recordType: true,
          rut: true,
          fullName: true,
          company: true,
          entryAt: true,
          exitAt: true,
          vehiclePlate: true,
          vehicleType: true,
          customFields: true,
          entryObservations: true,
          exitObservations: true,
        },
      }),
      prisma.accessControlRecord.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: records,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("[ClientPortal] Error fetching access history:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener historial" },
      { status: 500 }
    );
  }
}
