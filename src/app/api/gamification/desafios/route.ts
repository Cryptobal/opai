import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";

const VALID_TIPOS = ["semanal", "especial"];

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

    const desafios = await prisma.gamificacionDesafio.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(soloActivos ? { activo: true } : {}),
      },
      orderBy: [{ fechaInicio: "desc" }, { nombre: "asc" }],
    });

    return NextResponse.json({ success: true, data: desafios });
  } catch (error) {
    console.error("[API gamification/desafios] GET error:", error);
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
      "descripcion",
      "tipo",
      "condicionTipo",
      "condicionValor",
      "fechaInicio",
      "fechaFin",
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

    const desafio = await prisma.gamificacionDesafio.create({
      data: {
        tenantId: ctx.tenantId,
        nombre: body.nombre,
        descripcion: body.descripcion,
        tipo: body.tipo,
        condicionTipo: body.condicionTipo,
        condicionValor: body.condicionValor,
        condicionExtra: body.condicionExtra ?? undefined,
        puntosRecompensa: body.recompensaPuntos ?? body.puntosRecompensa ?? 0,
        badgeId: body.badgeId ?? null,
        fechaInicio: new Date(body.fechaInicio),
        fechaFin: new Date(body.fechaFin),
        activo: body.activo ?? true,
        installationId: body.installationId ?? null,
      },
    });

    return NextResponse.json({ success: true, data: desafio }, { status: 201 });
  } catch (error) {
    console.error("[API gamification/desafios] POST error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
