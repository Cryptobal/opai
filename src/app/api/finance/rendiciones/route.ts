import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  parseBody,
  resolveApiPerms,
} from "@/lib/api-auth";
import { canView, canEdit, hasCapability } from "@/lib/permissions";
import { z } from "zod";

// ── Zod schemas ──

const createRendicionSchema = z.object({
  type: z.enum(["PURCHASE", "MILEAGE"]),
  amount: z.number().int().min(0),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato: YYYY-MM-DD"),
  description: z.string().max(500).optional().nullable().transform((v) => v ?? undefined),
  documentType: z.enum(["BOLETA", "FACTURA", "SIN_RESPALDO"]).optional().nullable().transform((v) => v ?? undefined),
  itemId: z.string().uuid().optional().nullable().transform((v) => v ?? undefined),
  costCenterId: z.string().uuid().optional().nullable().transform((v) => v ?? undefined),
});

// ── GET: list rendiciones ──

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver rendiciones" },
        { status: 403 },
      );
    }

    const sp = request.nextUrl.searchParams;
    const status = sp.get("status") || undefined;
    const type = sp.get("type") || undefined;
    const submitterId = sp.get("submitterId") || undefined;
    const dateFrom = sp.get("dateFrom");
    const dateTo = sp.get("dateTo");
    const search = sp.get("search") || undefined;

    // If user cannot view all, restrict to their own
    const viewAll = hasCapability(perms, "rendicion_view_all");
    const effectiveSubmitter = viewAll ? submitterId : ctx.userId;

    const where: Record<string, unknown> = {
      tenantId: ctx.tenantId,
      ...(effectiveSubmitter ? { submitterId: effectiveSubmitter } : {}),
      ...(!viewAll ? { submitterId: ctx.userId } : {}),
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00.000Z`) } : {}),
              ...(dateTo ? { lte: new Date(`${dateTo}T00:00:00.000Z`) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const rendiciones = await prisma.financeRendicion.findMany({
      where,
      include: {
        item: { select: { id: true, name: true, code: true } },
        costCenter: { select: { id: true, name: true, code: true } },
        trip: { select: { id: true, distanceKm: true, totalAmount: true, status: true } },
        attachments: { select: { id: true, fileName: true, publicUrl: true, attachmentType: true } },
        _count: { select: { approvals: true } },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    return NextResponse.json({ success: true, data: rendiciones });
  } catch (error) {
    console.error("[Finance] Error listing rendiciones:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener las rendiciones" },
      { status: 500 },
    );
  }
}

// ── POST: create rendicion ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canEdit(perms, "finance", "rendiciones")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para crear rendiciones" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, createRendicionSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // Generate sequential code: REN-YYYY-XXXX
    const year = new Date().getFullYear();
    const prefix = `REN-${year}-`;
    const lastRendicion = await prisma.financeRendicion.findFirst({
      where: {
        tenantId: ctx.tenantId,
        code: { startsWith: prefix },
      },
      orderBy: { code: "desc" },
      select: { code: true },
    });

    let seq = 1;
    if (lastRendicion) {
      const lastSeq = parseInt(lastRendicion.code.replace(prefix, ""), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const code = `${prefix}${String(seq).padStart(4, "0")}`;

    const rendicion = await prisma.$transaction(async (tx) => {
      const created = await tx.financeRendicion.create({
        data: {
          tenantId: ctx.tenantId,
          code,
          submitterId: ctx.userId,
          type: body.type,
          status: "DRAFT",
          amount: body.amount,
          date: new Date(`${body.date}T00:00:00.000Z`),
          description: body.description ?? null,
          documentType: body.documentType ?? null,
          itemId: body.itemId ?? null,
          costCenterId: body.costCenterId ?? null,
        },
        include: {
          item: { select: { id: true, name: true } },
          costCenter: { select: { id: true, name: true } },
        },
      });

      await tx.financeRendicionHistory.create({
        data: {
          rendicionId: created.id,
          action: "CREATED",
          fromStatus: null,
          toStatus: "DRAFT",
          userId: ctx.userId,
          userName: ctx.userEmail,
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: rendicion }, { status: 201 });
  } catch (error) {
    console.error("[Finance] Error creating rendicion:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear la rendición" },
      { status: 500 },
    );
  }
}
