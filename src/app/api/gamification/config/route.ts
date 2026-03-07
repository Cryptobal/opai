import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { canView, canEdit } from "@/lib/permissions";
import { clearConfigCache } from "@/lib/gamification";

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canView(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    // Upsert: if no config exists, create one with defaults
    const config = await prisma.gamificacionConfig.upsert({
      where: { tenantId: ctx.tenantId },
      update: {},
      create: { tenantId: ctx.tenantId },
    });

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[API gamification/config] GET error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!canEdit(perms, "ops")) {
      return NextResponse.json({ success: false, error: "Sin permisos" }, { status: 403 });
    }

    const body = await request.json();

    // Remove non-updatable fields
    delete body.id;
    delete body.tenantId;
    delete body.createdAt;
    delete body.updatedAt;

    const config = await prisma.gamificacionConfig.upsert({
      where: { tenantId: ctx.tenantId },
      update: body,
      create: { tenantId: ctx.tenantId, ...body },
    });

    // Clear cache so new config takes effect immediately
    clearConfigCache(ctx.tenantId);

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error("[API gamification/config] PUT error:", error);
    return NextResponse.json({ success: false, error: "Error interno" }, { status: 500 });
  }
}
