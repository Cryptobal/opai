import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";
import { buildAccessRecordSearchOr } from "@/lib/access-control/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { installationId } = await params;

    if (!(await ensureInstallationAccess(session, installationId))) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    const where: Prisma.AccessControlRecordWhereInput = {
      tenantId: session.tenantId,
      installationId,
    };

    const status = searchParams.get("status");
    if (status === "in_site") where.exitAt = null;
    const entryAt: Prisma.DateTimeFilter = {};
    if (from) entryAt.gte = new Date(from);
    if (to) entryAt.lte = new Date(to);
    if (Object.keys(entryAt).length > 0) {
      where.entryAt = entryAt;
    }
    if (type) where.recordType = type;
    if (search) {
      where.OR = buildAccessRecordSearchOr(search, { includeCompany: true });
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
