import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";

const VALID_TIPOS = ["mensual", "evento_especial", "instalacion"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status");

    const fondos = await prisma.gamificacionFondoPremio.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(status ? { status } : {}),
      },
      include: {
        sugerenciasBono: {
          select: { id: true, status: true, montoSugeridoClp: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: fondos });
  } catch (error) {
    console.error("[API gamification/fondos] GET error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json();

    // Validate required fields
    const requiredFields = [
      "nombre",
      "tipo",
      "montoTotalClp",
      "fechaInicio",
      "fechaFin",
      "distribucion",
    ];
    const missing = requiredFields.filter((f) => body[f] === undefined || body[f] === null);
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Campos requeridos faltantes: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // Validate tipo
    if (!VALID_TIPOS.includes(body.tipo)) {
      return NextResponse.json(
        {
          success: false,
          error: `Tipo inválido. Opciones: ${VALID_TIPOS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const fondo = await prisma.gamificacionFondoPremio.create({
      data: {
        tenantId: ctx.tenantId,
        nombre: body.nombre,
        descripcion: body.descripcion ?? null,
        tipo: body.tipo,
        montoTotalClp: body.montoTotalClp,
        fechaInicio: new Date(body.fechaInicio),
        fechaFin: new Date(body.fechaFin),
        distribucion: body.distribucion,
        status: body.status ?? "activo",
        installationId: body.installationId ?? null,
      },
    });

    return NextResponse.json({ success: true, data: fondo }, { status: 201 });
  } catch (error) {
    console.error("[API gamification/fondos] POST error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
