import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView } from "@/lib/permissions";

type Params = { installationId: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const { installationId } = await params;

    const categories = await prisma.opsInstallationPhotoCategory.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
        isActive: true,
      },
      orderBy: { sortOrder: "asc" },
    });

    // If no custom categories, return defaults
    if (categories.length === 0) {
      const defaults = [
        { id: "default-puesto", name: "Puesto de guardia", isMandatory: true, sortOrder: 0 },
        { id: "default-presentacion", name: "Presentación personal", isMandatory: true, sortOrder: 1 },
        { id: "default-libro", name: "Libro de novedades", isMandatory: true, sortOrder: 2 },
        { id: "default-hallazgo", name: "Hallazgo detectado", isMandatory: false, sortOrder: 3 },
        { id: "default-otra", name: "Otra evidencia", isMandatory: false, sortOrder: 4 },
      ];
      return NextResponse.json({ success: true, data: defaults, isDefault: true });
    }

    return NextResponse.json({ success: true, data: categories, isDefault: false });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching photo categories:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las categorías de fotos" },
      { status: 500 },
    );
  }
}
