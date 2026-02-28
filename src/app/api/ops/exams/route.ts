/**
 * API Route: /api/ops/exams
 * GET  - List exams (filtered by installationId and/or type)
 * POST - Create a new exam
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canDelete } from "@/lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos para ver exámenes" }, { status: 403 });
    }

    const installationId = request.nextUrl.searchParams.get("installationId");
    const type = request.nextUrl.searchParams.get("type");

    const where: Record<string, unknown> = { tenantId: ctx.tenantId };
    if (installationId) where.installationId = installationId;
    if (type) where.type = type;

    const exams = await prisma.opsExam.findMany({
      where,
      include: {
        _count: { select: { questions: true, assignments: true } },
        installation: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: exams });
  } catch (error) {
    console.error("[OPS][EXAM] Error fetching exams:", error);
    return NextResponse.json(
      { success: false, error: "Error al obtener exámenes" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();

    const perms = await resolveApiPerms(ctx);
    if (!canDelete(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Solo administradores pueden crear exámenes" }, { status: 403 });
    }

    const body = await request.json();
    const { installationId, title, type, scheduleType, recurringMonths } = body;

    if (!installationId || !title) {
      return NextResponse.json(
        { success: false, error: "installationId y title son requeridos" },
        { status: 400 },
      );
    }

    const exam = await prisma.opsExam.create({
      data: {
        tenantId: ctx.tenantId,
        installationId,
        title,
        type: type ?? "protocol",
        scheduleType: scheduleType ?? "manual",
        recurringMonths: recurringMonths ?? null,
        createdBy: ctx.userId,
      },
    });

    return NextResponse.json({ success: true, data: exam }, { status: 201 });
  } catch (error) {
    console.error("[OPS][EXAM] Error creating exam:", error);
    return NextResponse.json(
      { success: false, error: "Error al crear examen" },
      { status: 500 },
    );
  }
}
