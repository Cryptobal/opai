import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";

const STATUSES_POR_REALIZAR = ["programada", "borrador", "en_curso"];

/**
 * DELETE /api/crm/visitas-tecnicas/[id]
 * Elimina una visita técnica por realizar (solo admin o propietario).
 * Al borrarse de la BD, desaparece también del portal del supervisor.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { userRole, tenantId } = ctx;
    if (userRole !== "owner" && userRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo admin o propietario pueden eliminar visitas técnicas" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const visita = await prisma.opsVisitaTecnica.findFirst({
      where: { id, tenantId },
    });

    if (!visita) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 }
      );
    }

    if (!STATUSES_POR_REALIZAR.includes(visita.status)) {
      return NextResponse.json(
        { success: false, error: "Solo se pueden eliminar visitas por realizar (programada, borrador o en curso)" },
        { status: 400 }
      );
    }

    await prisma.opsVisitaTecnica.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[crm/visitas-tecnicas] DELETE error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo eliminar la visita técnica" },
      { status: 500 }
    );
  }
}
