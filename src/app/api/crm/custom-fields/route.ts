/**
 * API Route: /api/crm/custom-fields
 * GET  - Listar campos personalizados
 * POST - Crear campo personalizado
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getDefaultTenantId } from "@/lib/tenant";

export async function GET() {
  try {
    const session = await auth();
    const tenantId = session?.user?.tenantId ?? (await getDefaultTenantId());

    const fields = await prisma.crmCustomField.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: fields });
  } catch (error) {
    console.error("Error fetching CRM custom fields:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch custom fields" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "No autorizado" },
        { status: 401 }
      );
    }
    const tenantId = session.user?.tenantId ?? (await getDefaultTenantId());
    const body = await request.json();

    if (!body?.name?.trim() || !body?.entityType?.trim() || !body?.type?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nombre, entidad y tipo son requeridos" },
        { status: 400 }
      );
    }

    const field = await prisma.crmCustomField.create({
      data: {
        tenantId,
        name: body.name.trim(),
        entityType: body.entityType.trim(),
        type: body.type.trim(),
        options: body.options ?? null,
      },
    });

    return NextResponse.json({ success: true, data: field }, { status: 201 });
  } catch (error) {
    console.error("Error creating CRM custom field:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create custom field" },
      { status: 500 }
    );
  }
}
