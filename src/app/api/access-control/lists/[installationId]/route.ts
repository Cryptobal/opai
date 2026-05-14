import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateRut, cleanRut, cleanPlate } from "@/lib/access-control/utils";
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
    const tenantId = authCtx.tenantId;

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "whitelist" | "blacklist" | null;

    const where: Record<string, unknown> = { tenantId };

    if (type === "blacklist") {
      where.OR = [
        { installationId, listType: "blacklist" },
        { scope: "global", listType: "blacklist" },
      ];
    } else if (type === "whitelist") {
      where.installationId = installationId;
      where.listType = "whitelist";
    } else {
      where.OR = [
        { installationId },
        { scope: "global", listType: "blacklist" },
      ];
    }

    const lists = await safeAccessControlQuery(
      () => prisma.accessControlList.findMany({ where, orderBy: { createdAt: "desc" } }),
      [],
    );

    return NextResponse.json({ success: true, data: lists });
  } catch (error) {
    console.error("[AccessControl] Error fetching lists:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener listas" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const body = await request.json();

    const hasRut = typeof body.rut === "string" && body.rut.trim().length > 0;
    const hasPlate = typeof body.vehiclePlate === "string" && body.vehiclePlate.trim().length > 0;

    if (!hasRut && !hasPlate) {
      return NextResponse.json(
        { success: false, error: "Debe especificar al menos RUT o patente" },
        { status: 400 }
      );
    }
    if (hasRut && !validateRut(body.rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    const cleanedRut = hasRut ? cleanRut(body.rut) : null;
    const cleanedPlate = hasPlate ? cleanPlate(body.vehiclePlate) : null;

    const entry = await prisma.accessControlList.create({
      data: {
        tenantId: authCtx.tenantId,
        installationId: body.scope === "global" ? null : installationId,
        listType: body.listType,
        rut: cleanedRut,
        vehiclePlate: cleanedPlate,
        fullName: body.fullName,
        company: body.company || null,
        blockReason: body.blockReason || null,
        scope: body.scope || "local",
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        allowedDays: Array.isArray(body.allowedDays) ? body.allowedDays : [],
        allowedTimeFrom: body.allowedTimeFrom || null,
        allowedTimeTo: body.allowedTimeTo || null,
        recordType: body.recordType || "visit",
        singleUse: !!body.singleUse,
        isActive: true,
        createdBy: body.createdBy || null,
      },
    });

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  } catch (error) {
    console.error("[AccessControl] Error creating list entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear entrada en lista" },
      { status: 500 }
    );
  }
}
