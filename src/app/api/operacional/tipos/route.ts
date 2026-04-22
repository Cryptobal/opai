import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);
    const capa = searchParams.get("capa");

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      isActive: true,
    };
    if (capa) where.capa = capa;

    const tipos = await prisma.tipoDocOperacional.findMany({
      where,
      orderBy: { order: "asc" },
      include: {
        documentos: {
          where: { tenantId: ctx.tenantId, capa: "global", installationId: null },
          select: { id: true, status: true, fileName: true, expiresAt: true },
          take: 1,
        },
      },
    });

    const data = tipos.map((t) => ({
      id: t.id,
      codigo: t.codigo,
      nombre: t.nombre,
      descripcion: t.descripcion,
      capa: t.capa,
      obligatorio: t.obligatorio,
      tieneVencimiento: t.tieneVencimiento,
      diasAlerta: t.diasAlerta,
      normativa: t.normativa,
      order: t.order,
      obligatorioEnVisita: t.obligatorioEnVisita,
      // Para capa global, incluir info del documento actual
      documentoActual: t.capa === "global" && t.documentos.length > 0
        ? {
            id: t.documentos[0].id,
            status: t.documentos[0].status,
            fileName: t.documentos[0].fileName,
            expiresAt: t.documentos[0].expiresAt?.toISOString().slice(0, 10) ?? null,
          }
        : null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[TIPOS-DOC-OP] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener tipos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const body = await request.json();
    const nombre = body.nombre?.trim();
    const capa = body.capa;

    if (!nombre) {
      return NextResponse.json({ success: false, error: "Nombre requerido" }, { status: 400 });
    }
    if (!["global", "instalacion", "guardia"].includes(capa)) {
      return NextResponse.json({ success: false, error: "Capa inválida" }, { status: 400 });
    }

    const codigo = "custom_" + nombre.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");

    // Check duplicates
    const existing = await prisma.tipoDocOperacional.findFirst({
      where: { tenantId: ctx.tenantId, codigo },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Ya existe un tipo con ese nombre" }, { status: 400 });
    }

    const maxOrder = await prisma.tipoDocOperacional.findFirst({
      where: { tenantId: ctx.tenantId, capa },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const tipo = await prisma.tipoDocOperacional.create({
      data: {
        tenantId: ctx.tenantId,
        codigo,
        nombre,
        capa,
        obligatorio: body.obligatorio ?? false,
        tieneVencimiento: body.tieneVencimiento ?? true,
        diasAlerta: body.diasAlerta ?? 30,
        normativa: body.normativa?.trim() || null,
        order: (maxOrder?.order ?? 0) + 1,
        obligatorioEnVisita: body.obligatorioEnVisita ?? true,
      },
    });

    return NextResponse.json({ success: true, data: tipo }, { status: 201 });
  } catch (error) {
    console.error("[TIPOS-DOC-OP] Error creating:", error);
    return NextResponse.json({ success: false, error: "Error al crear tipo" }, { status: 500 });
  }
}
