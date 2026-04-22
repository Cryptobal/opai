/**
 * API Route: /api/operacional/verificaciones-fisicas
 * GET  - List verification history with filters and cursor-based pagination
 * POST - Batch create verificaciones from a supervision visit
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const { searchParams } = new URL(request.url);

    const installationId = searchParams.get("installationId") ?? undefined;
    const tipoDocId = searchParams.get("tipoDocId") ?? undefined;
    const guardiaId = searchParams.get("guardiaId") ?? undefined;
    const guardiaDocType = searchParams.get("guardiaDocType") ?? undefined;
    const capaRaw = searchParams.get("capa") ?? undefined;
    const limitRaw = searchParams.get("limit");
    const cursor = searchParams.get("cursor") ?? undefined;

    const limit = Math.min(Math.max(parseInt(limitRaw ?? "50", 10) || 50, 1), 200);

    const capaSchema = z.enum(["global", "instalacion", "guardia"]).optional();
    const capaResult = capaSchema.safeParse(capaRaw);
    if (!capaResult.success) {
      return NextResponse.json(
        { success: false, error: "capa debe ser: global | instalacion | guardia" },
        { status: 400 }
      );
    }
    const capa = capaResult.data;

    const items = await prisma.docVerificacionFisica.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(installationId ? { installationId } : {}),
        ...(tipoDocId ? { tipoDocId } : {}),
        ...(guardiaId ? { guardiaId } : {}),
        ...(guardiaDocType ? { guardiaDocType } : {}),
        ...(capa ? { capa } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      include: {
        supervisor: {
          select: { id: true, name: true },
        },
        supervision: {
          select: { id: true, checkInAt: true },
        },
        hallazgo: {
          select: { id: true, ticketId: true, severity: true },
        },
      },
    });

    const hasMore = items.length >= limit;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return NextResponse.json({
      success: true,
      data: items,
      meta: { hasMore, nextCursor },
    });
  } catch (error) {
    console.error("[VERIFICACIONES-FISICAS] GET error:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener verificaciones físicas" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST — batch create
// ---------------------------------------------------------------------------

const verificacionSchema = z.object({
  tipoDocId: z.string().optional(),
  guardiaDocType: z.string().optional(),
  capa: z.enum(["global", "instalacion", "guardia"]),
  installationId: z.string().min(1),
  guardiaId: z.string().optional(),
  presente: z.boolean(),
  photoUrl: z.string().url().optional(),
  photoKey: z.string().optional(),
  notes: z.string().optional(),
  hallazgoId: z.string().optional(),
});

const postBodySchema = z.object({
  supervisionId: z.string().min(1),
  verificaciones: z.array(verificacionSchema).min(1),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "JSON inválido en el cuerpo de la solicitud" },
        { status: 400 }
      );
    }

    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Datos inválidos", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { supervisionId, verificaciones } = parsed.data;

    // Validate supervision belongs to this tenant
    const supervision = await prisma.opsVisitaSupervision.findFirst({
      where: { id: supervisionId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!supervision) {
      return NextResponse.json(
        { success: false, error: "Supervisión no encontrada o sin acceso" },
        { status: 404 }
      );
    }

    // Batch create in a transaction
    const created = await prisma.$transaction(
      verificaciones.map((v) =>
        prisma.docVerificacionFisica.create({
          data: {
            tenantId: ctx.tenantId,
            supervisionId,
            supervisorId: ctx.userId,
            capa: v.capa,
            installationId: v.installationId,
            ...(v.tipoDocId ? { tipoDocId: v.tipoDocId } : {}),
            ...(v.guardiaDocType ? { guardiaDocType: v.guardiaDocType } : {}),
            ...(v.guardiaId ? { guardiaId: v.guardiaId } : {}),
            presente: v.presente,
            ...(v.photoUrl ? { photoUrl: v.photoUrl } : {}),
            ...(v.photoKey ? { photoKey: v.photoKey } : {}),
            ...(v.notes ? { notes: v.notes } : {}),
            ...(v.hallazgoId ? { hallazgoId: v.hallazgoId } : {}),
          },
          select: { id: true, capa: true, presente: true, createdAt: true },
        })
      )
    );

    return NextResponse.json(
      { success: true, data: created, meta: { count: created.length } },
      { status: 201 }
    );
  } catch (error) {
    console.error("[VERIFICACIONES-FISICAS] POST error:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear verificaciones físicas" },
      { status: 500 }
    );
  }
}
