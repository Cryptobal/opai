import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";

const VALID_CATEGORIAS = ["convenio", "tiempo_libre", "producto", "experiencia"];

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const soloActivos = searchParams.get("activo") !== "false";

    const beneficios = await prisma.gamificacionBeneficio.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(soloActivos ? { activo: true } : {}),
      },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    });

    return NextResponse.json({ success: true, data: beneficios });
  } catch (error) {
    console.error("[API gamification/beneficios] GET error:", error);
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
    const requiredFields = ["nombre", "descripcion", "categoria"];
    const missing = requiredFields.filter((f) => body[f] === undefined || body[f] === null);
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Campos requeridos faltantes: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // Validate categoria
    if (!VALID_CATEGORIAS.includes(body.categoria)) {
      return NextResponse.json(
        {
          success: false,
          error: `Categoría inválida. Opciones: ${VALID_CATEGORIAS.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const beneficio = await prisma.gamificacionBeneficio.create({
      data: {
        tenantId: ctx.tenantId,
        nombre: body.nombre,
        descripcion: body.descripcion,
        categoria: body.categoria,
        costoPuntos: body.costoPuntos ?? null,
        proveedor: body.proveedor ?? null,
        imagenUrl: body.imagen ?? body.imagenUrl ?? null,
        stockDisponible: body.stockDisponible ?? null,
        fechaInicio: body.fechaInicio ? new Date(body.fechaInicio) : null,
        fechaFin: body.fechaFin ? new Date(body.fechaFin) : null,
        activo: body.activo ?? true,
      },
    });

    return NextResponse.json({ success: true, data: beneficio }, { status: 201 });
  } catch (error) {
    console.error("[API gamification/beneficios] POST error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
