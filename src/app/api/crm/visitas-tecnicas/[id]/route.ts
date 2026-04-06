import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';

const STATUSES_POR_REALIZAR = ["programada", "borrador", "en_curso"];

/**
 * PATCH /api/crm/visitas-tecnicas/[id]
 * Permite al admin/owner cerrar manualmente una visita "en_curso".
 * Útil cuando el supervisor no pudo completarla (ej: firma no disponible).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const { userRole, tenantId } = ctx;
    if (userRole !== "owner" && userRole !== "admin") {
      return NextResponse.json(
        { success: false, error: "Solo admin o propietario pueden cerrar visitas técnicas" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    const visita = await prisma.opsVisitaTecnica.findFirst({
      where: { id, tenantId },
    });

    if (!visita) {
      return NextResponse.json(
        { success: false, error: "Visita no encontrada" },
        { status: 404 }
      );
    }

    if (body.complete === true) {
      if (visita.status === "completada") {
        return NextResponse.json(
          { success: false, error: "La visita ya está completada" },
          { status: 400 }
        );
      }

      const updateData: Record<string, unknown> = {
        status: "completada",
        checkOutAt: new Date(),
      };

      if (visita.checkInAt) {
        const diffMs = Date.now() - new Date(visita.checkInAt).getTime();
        updateData.durationMinutes = Math.round(diffMs / 60000);
      }

      const updated = await prisma.opsVisitaTecnica.update({
        where: { id },
        data: updateData,
      });

      return NextResponse.json({ success: true, data: updated });
    }

    return NextResponse.json(
      { success: false, error: "Operación no soportada" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[crm/visitas-tecnicas] PATCH error:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la visita técnica" },
      { status: 500 }
    );
  }
}

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
    const modCheck = await requireTenantModule('crm');
    if (!modCheck.authorized) return modCheck.response;

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
