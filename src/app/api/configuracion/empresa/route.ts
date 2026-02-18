import { NextRequest, NextResponse } from "next/server";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const EMPRESA_KEYS = [
  "empresa.razonSocial",
  "empresa.rut",
  "empresa.direccion",
  "empresa.comuna",
  "empresa.ciudad",
  "empresa.telefono",
  "empresa.repLegalNombre",
  "empresa.repLegalRut",
];

/**
 * GET /api/configuracion/empresa — Get company settings
 */
export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const settings = await prisma.setting.findMany({
      where: {
        tenantId: ctx.tenantId,
        key: { in: EMPRESA_KEYS },
      },
    });

    const data: Record<string, string> = {};
    for (const s of settings) {
      data[s.key] = s.value;
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[CONFIG] Error loading empresa settings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo cargar la configuración" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/configuracion/empresa — Update company settings
 * Body: { "empresa.razonSocial": "...", "empresa.rut": "...", ... }
 */
export async function PATCH(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    // Only owner/admin can update
    if (!["owner", "admin"].includes(ctx.userRole ?? "")) {
      return NextResponse.json(
        { success: false, error: "Solo administradores pueden modificar esta configuración" },
        { status: 403 }
      );
    }

    const body = await request.json();

    for (const key of EMPRESA_KEYS) {
      if (body[key] !== undefined) {
        await prisma.setting.upsert({
          where: {
            tenantId_key: { tenantId: ctx.tenantId, key },
          },
          create: {
            key,
            value: String(body[key]),
            type: "string",
            category: "empresa",
            tenantId: ctx.tenantId,
          },
          update: {
            value: String(body[key]),
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[CONFIG] Error updating empresa settings:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo actualizar la configuración" },
      { status: 500 }
    );
  }
}
