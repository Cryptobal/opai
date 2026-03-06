import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateRut, cleanRut } from "@/lib/access-control/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "whitelist" | "blacklist" | null;

    const where: Record<string, unknown> = {};

    if (type === "blacklist") {
      // Blacklist: local entries for this installation + all global entries
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

    const lists = await prisma.accessControlList.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

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
    const body = await request.json();

    // Validate RUT
    if (!body.rut || !validateRut(body.rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    // Get installation for tenantId
    const installation = await prisma.crmInstallation.findUnique({
      where: { id: installationId },
      select: { tenantId: true },
    });

    if (!installation) {
      return NextResponse.json(
        { success: false, error: "Instalación no encontrada" },
        { status: 404 }
      );
    }

    const cleanedRut = cleanRut(body.rut);

    const entry = await prisma.accessControlList.create({
      data: {
        tenantId: installation.tenantId,
        installationId: body.scope === "global" ? null : installationId,
        listType: body.listType,
        rut: cleanedRut,
        fullName: body.fullName,
        company: body.company || null,
        blockReason: body.blockReason || null,
        scope: body.scope || "local",
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        allowedDays: body.allowedDays || [],
        allowedTimeFrom: body.allowedTimeFrom || null,
        allowedTimeTo: body.allowedTimeTo || null,
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
