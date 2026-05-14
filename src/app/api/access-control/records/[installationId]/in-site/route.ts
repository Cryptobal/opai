import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { installationTenantScope } from "@/lib/access-control/installation-scope";
import { safeAccessControlQuery } from "@/lib/access-control/safe-query";
import { requireAccessControlAuth } from "@/lib/access-control/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const authCtx = await requireAccessControlAuth(request, installationId);
    if (!authCtx) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");

    console.info(
      "[in-site] tenant=%s installation=%s search=%s",
      authCtx.tenantId,
      installationId,
      search ?? "(none)"
    );

    const baseWhere: Prisma.AccessControlRecordWhereInput = {
      ...installationTenantScope(installationId, authCtx.tenantId),
      exitAt: null,
    };

    const where: Prisma.AccessControlRecordWhereInput = search
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { fullName: { contains: search, mode: "insensitive" } },
                { rut: { contains: search } },
                { vehiclePlate: { contains: search, mode: "insensitive" } },
              ],
            },
          ],
        }
      : baseWhere;

    const records = await safeAccessControlQuery(
      () => prisma.accessControlRecord.findMany({
        where,
        orderBy: { entryAt: "desc" },
      }),
      [],
    );

    // Compute counts
    const personCount = records.filter((r: { recordType: string }) => r.recordType !== "vehicle").length;
    const vehicleCount = records.filter((r: { recordType: string }) => r.recordType === "vehicle").length;

    console.info(
      "[in-site] returned count=%d (person=%d vehicle=%d)",
      records.length,
      personCount,
      vehicleCount
    );
    if (records.length === 0 && !search) {
      console.warn(
        "[in-site] empty result with no search filter — investigar tenant=%s installation=%s",
        authCtx.tenantId,
        installationId
      );
    }

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
