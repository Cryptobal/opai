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
    const date = searchParams.get("date");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { installationId };

    if (date) {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);
      where.expectedDate = { gte: d, lt: nextDay };
    }

    if (status) {
      where.status = status;
    }

    const preregistrations = await prisma.accessControlPreregistration.findMany({
      where,
      orderBy: { expectedDate: "desc" },
    });

    return NextResponse.json({ success: true, data: preregistrations });
  } catch (error) {
    console.error("[AccessControl] Error fetching preregistrations:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener pre-registros" },
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

    if (!body.visitorRut || !validateRut(body.visitorRut)) {
      return NextResponse.json(
        { success: false, error: "RUT del visitante inválido" },
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

    const prereg = await prisma.accessControlPreregistration.create({
      data: {
        tenantId: installation.tenantId,
        installationId,
        visitorRut: cleanRut(body.visitorRut),
        visitorName: body.visitorName,
        visitorCompany: body.visitorCompany || null,
        hostName: body.hostName || null,
        hostContact: body.hostContact || null,
        expectedDate: new Date(body.expectedDate),
        expectedTimeFrom: body.expectedTimeFrom || null,
        expectedTimeTo: body.expectedTimeTo || null,
        purpose: body.purpose || null,
        recordType: body.recordType || "visit",
        status: "pending",
        createdBy: body.createdBy || null,
        createdByClient: body.createdByClient || false,
      },
    });

    return NextResponse.json({ success: true, data: prereg }, { status: 201 });
  } catch (error) {
    console.error("[AccessControl] Error creating preregistration:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear pre-registro" },
      { status: 500 }
    );
  }
}
