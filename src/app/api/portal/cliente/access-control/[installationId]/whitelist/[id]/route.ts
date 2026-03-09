import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { parsePortalClienteSessionCookie } from "@/lib/portal-cliente";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ installationId: string; id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const session = parsePortalClienteSessionCookie(
      cookieStore.get("portal_cliente_session")?.value
    );
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { installationId, id } = await params;

    if (!session.installations.some((i) => i.id === installationId)) {
      return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
    }

    const body = await request.json();

    // Verify it's a whitelist entry (clients can only manage whitelist)
    const existing = await prisma.accessControlList.findUnique({ where: { id } });
    if (!existing || existing.listType !== "whitelist") {
      return NextResponse.json(
        { success: false, error: "Entrada no encontrada" },
        { status: 404 }
      );
    }

    const entry = await prisma.accessControlList.update({
      where: { id },
      data: {
        fullName: body.fullName,
        company: body.company,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        allowedDays: body.allowedDays,
        allowedTimeFrom: body.allowedTimeFrom,
        allowedTimeTo: body.allowedTimeTo,
        isActive: body.isActive,
      },
    });

    return NextResponse.json({ success: true, data: entry });
  } catch (error) {
    console.error("[ClientPortal] Error updating whitelist entry:", error);
    return NextResponse.json(
      { success: false, error: "Error al actualizar entrada" },
      { status: 500 }
    );
  }
}
