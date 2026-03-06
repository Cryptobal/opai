import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateRut, cleanRut } from "@/lib/access-control/utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ installationId: string }> }
) {
  try {
    const { installationId } = await params;

    const entries = await prisma.accessControlList.findMany({
      where: {
        installationId,
        listType: "whitelist",
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: entries });
  } catch (error) {
    console.error("[ClientPortal] Error fetching whitelist:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener lista blanca" },
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

    if (!body.rut || !validateRut(body.rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

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

    const entry = await prisma.accessControlList.create({
      data: {
        tenantId: installation.tenantId,
        installationId,
        listType: "whitelist",
        rut: cleanRut(body.rut),
        fullName: body.fullName,
        company: body.company || null,
        scope: "local",
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
    console.error("[ClientPortal] Error creating whitelist entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al agregar a lista blanca" },
      { status: 500 }
    );
  }
}
