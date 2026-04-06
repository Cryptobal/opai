import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';
import { canView } from "@/lib/permissions";

type Params = { installationId: string };

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const modCheck = await requireTenantModule('ops_supervision');
  if (!modCheck.authorized) return modCheck.response;
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
    // Puesto de guardia y Libro de novedades están en Step 3 (Verificación)
    if (categories.length === 0) {
      const defaults = [
        { id: "default-hallazgo", name: "Hallazgo detectado", isMandatory: false, sortOrder: 0 },
        { id: "default-otra", name: "Otra evidencia", isMandatory: false, sortOrder: 1 },
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
