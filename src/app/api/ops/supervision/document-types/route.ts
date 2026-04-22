/**
 * GET /api/ops/supervision/document-types
 * Lista de documentos de instalación para el checklist en visitas.
 * Requiere canView ops.supervision.
 */

import { NextResponse } from "next/server";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { requireTenantModule } from '@/lib/require-module';
import { canView } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const modCheck = await requireTenantModule('ops_supervision');
  if (!modCheck.authorized) return modCheck.response;
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "ops", "supervision")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para supervisión" },
        { status: 403 },
      );
    }

    const tipos = await prisma.tipoDocOperacional.findMany({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        capa: "instalacion",
        obligatorioEnVisita: true,
      },
      orderBy: { order: "asc" },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        obligatorio: true,
      },
    });

    const documents = tipos.map((tipo) => ({
      tipoDocId: tipo.id,
      code: tipo.codigo,
      label: tipo.nombre,
      required: tipo.obligatorio,
      capa: "instalacion" as const,
    }));

    return NextResponse.json({ success: true, data: documents });
  } catch (error) {
    console.error("[OPS][SUPERVISION] Error fetching document types:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los tipos de documento" },
      { status: 500 },
    );
  }
}
