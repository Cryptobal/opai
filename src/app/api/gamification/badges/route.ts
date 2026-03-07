import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";

const VALID_CATEGORIES = [
  "racha",
  "asistencia",
  "rondas",
  "equipo",
  "secreto",
  "capacitacion",
  "especial",
];

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const badges = await prisma.gamificacionBadge.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ categoria: "asc" }, { nombre: "asc" }],
    });

    return NextResponse.json({ success: true, data: badges });
  } catch (error) {
    console.error("[API gamification/badges] GET error:", error);
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
      "categoria",
      "icono",
      "condicionTipo",
      "condicionValor",
      "puntosBonus",
    ];
    const missing = requiredFields.filter((f) => body[f] === undefined || body[f] === null);
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: `Campos requeridos faltantes: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    // Validate category
    if (!VALID_CATEGORIES.includes(body.categoria)) {
      return NextResponse.json(
        {
          success: false,
          error: `Categoría inválida. Opciones: ${VALID_CATEGORIES.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Generate codigo from nombre if not provided
    const codigo =
      body.codigo ||
      body.nombre
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "");

    // Check for duplicate codigo
    const existing = await prisma.gamificacionBadge.findFirst({
      where: { tenantId: ctx.tenantId, codigo },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: `Ya existe un badge con código "${codigo}"` },
        { status: 409 },
      );
    }

    const badge = await prisma.gamificacionBadge.create({
      data: {
        tenantId: ctx.tenantId,
        codigo,
        nombre: body.nombre,
        descripcion: body.descripcion,
        categoria: body.categoria,
        icono: body.icono,
        color: body.color ?? null,
        condicionTipo: body.condicionTipo,
        condicionValor: body.condicionValor,
        condicionExtra: body.condicionExtra ?? undefined,
        esSecreto: body.esSecreto ?? false,
        esUnico: body.esUnico ?? true,
        activo: body.activo ?? true,
        orden: body.orden ?? 0,
        puntosBonus: body.puntosBonus,
      },
    });

    return NextResponse.json({ success: true, data: badge }, { status: 201 });
  } catch (error) {
    console.error("[API gamification/badges] POST error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
