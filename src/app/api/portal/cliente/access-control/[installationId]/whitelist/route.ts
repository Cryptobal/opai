import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureInstallationAccess, requirePortalClienteAuth } from "@/lib/portal-cliente";
import { validateRut, cleanRut } from "@/lib/access-control/utils";

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

    const entries = await prisma.accessControlList.findMany({
      where: {
        tenantId: session.tenantId,
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
    const session = await requirePortalClienteAuth(request);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { installationId } = await params;

    if (!(await ensureInstallationAccess(session, installationId))) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const body = await request.json();

    if (!body.rut || !validateRut(body.rut)) {
      return NextResponse.json(
        { success: false, error: "RUT inválido" },
        { status: 400 }
      );
    }

    const entry = await prisma.accessControlList.create({
      data: {
        tenantId: session.tenantId,
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
        createdBy: session.contactId,
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
