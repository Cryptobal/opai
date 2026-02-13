import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { z } from "zod";

const createItemSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().max(50).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  active: z.boolean().default(true),
  maxPerDay: z.number().int().positive().optional().nullable(),
  maxPerMonth: z.number().int().positive().optional().nullable(),
  accountCode: z.string().max(50).optional().nullable(),
});

// ── GET: list items ──

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver ítems" },
        { status: 403 },
      );
    }

    const items = await prisma.financeRendicionItem.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("[Finance] Error listing items:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los ítems" },
      { status: 500 },
    );
  }
}

// ── POST: create item ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_configure")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para crear ítems" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, createItemSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // Check for duplicate name
    const existing = await prisma.financeRendicionItem.findFirst({
      where: { tenantId: ctx.tenantId, name: body.name },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Ya existe un ítem con ese nombre" },
        { status: 400 },
      );
    }

    const item = await prisma.financeRendicionItem.create({
      data: {
        tenantId: ctx.tenantId,
        name: body.name,
        code: body.code ?? null,
        category: body.category ?? null,
        active: body.active,
        maxPerDay: body.maxPerDay ?? null,
        maxPerMonth: body.maxPerMonth ?? null,
        accountCode: body.accountCode ?? null,
      },
    });

    return NextResponse.json({ success: true, data: item }, { status: 201 });
  } catch (error) {
    console.error("[Finance] Error creating item:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el ítem" },
      { status: 500 },
    );
  }
}
