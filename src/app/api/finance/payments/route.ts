import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  unauthorized,
  resolveApiPerms,
  parseBody,
} from "@/lib/api-auth";
import { canView, hasCapability } from "@/lib/permissions";
import { notifyRendicionPaid } from "@/lib/finance-notifications";
import { z } from "zod";

const createPaymentSchema = z.object({
  rendicionIds: z.array(z.string().uuid()).min(1, "Al menos una rendición es requerida"),
  type: z.enum(["BATCH_SANTANDER", "MANUAL"]).default("MANUAL"),
  notes: z.string().max(500).optional(),
});

// ── GET: list payments ──

export async function GET() {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!canView(perms, "finance", "pagos")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para ver pagos" },
        { status: 403 },
      );
    }

    const payments = await prisma.financePayment.findMany({
      where: { tenantId: ctx.tenantId },
      include: {
        rendiciones: {
          select: {
            id: true,
            code: true,
            amount: true,
            submitterId: true,
            type: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: payments });
  } catch (error) {
    console.error("[Finance] Error listing payments:", error);
    return NextResponse.json(
      { success: false, error: "No se pudieron obtener los pagos" },
      { status: 500 },
    );
  }
}

// ── POST: create payment batch ──

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);

    if (!hasCapability(perms, "rendicion_pay")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos para crear pagos" },
        { status: 403 },
      );
    }

    const parsed = await parseBody(request, createPaymentSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    // Validate all rendiciones exist and are APPROVED
    const rendiciones = await prisma.financeRendicion.findMany({
      where: {
        id: { in: body.rendicionIds },
        tenantId: ctx.tenantId,
        status: "APPROVED",
      },
    });

    if (rendiciones.length !== body.rendicionIds.length) {
      const foundIds = new Set(rendiciones.map((r) => r.id));
      const missing = body.rendicionIds.filter((id) => !foundIds.has(id));
      return NextResponse.json(
        {
          success: false,
          error: `Algunas rendiciones no existen o no están aprobadas: ${missing.join(", ")}`,
        },
        { status: 400 },
      );
    }

    // Generate sequential code: PAG-YYYY-XXXX
    const year = new Date().getFullYear();
    const prefix = `PAG-${year}-`;
    const lastPayment = await prisma.financePayment.findFirst({
      where: { tenantId: ctx.tenantId, code: { startsWith: prefix } },
      orderBy: { code: "desc" },
      select: { code: true },
    });

    let seq = 1;
    if (lastPayment) {
      const lastSeq = parseInt(lastPayment.code.replace(prefix, ""), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const code = `${prefix}${String(seq).padStart(4, "0")}`;

    const totalAmount = rendiciones.reduce((sum, r) => sum + r.amount, 0);
    const now = new Date();

    const payment = await prisma.$transaction(async (tx) => {
      const created = await tx.financePayment.create({
        data: {
          tenantId: ctx.tenantId,
          code,
          type: body.type,
          totalAmount,
          rendicionCount: rendiciones.length,
          paidById: ctx.userId,
          paidAt: now,
          notes: body.notes ?? null,
        },
      });

      // Update all rendiciones to PAID
      for (const rendicion of rendiciones) {
        await tx.financeRendicion.update({
          where: { id: rendicion.id },
          data: {
            status: "PAID",
            paymentId: created.id,
            paidAt: now,
            paymentMethod: body.type,
          },
        });

        await tx.financeRendicionHistory.create({
          data: {
            rendicionId: rendicion.id,
            action: "PAID",
            fromStatus: "APPROVED",
            toStatus: "PAID",
            userId: ctx.userId,
            userName: ctx.userEmail,
            comment: `Incluida en pago ${code}`,
            metadata: { paymentId: created.id, paymentCode: code },
          },
        });
      }

      return tx.financePayment.findUnique({
        where: { id: created.id },
        include: {
          rendiciones: {
            select: { id: true, code: true, amount: true, submitterId: true },
          },
        },
      });
    });

    // Send email notifications to each rendicion submitter (fire-and-forget)
    const submitterIds = [...new Set(rendiciones.map((r) => r.submitterId))];
    const submitters = await prisma.admin.findMany({
      where: { id: { in: submitterIds } },
      select: { id: true, email: true },
    });
    const submitterMap = new Map(submitters.map((s) => [s.id, s.email]));

    for (const rendicion of rendiciones) {
      const submitterEmail = submitterMap.get(rendicion.submitterId);
      if (submitterEmail) {
        notifyRendicionPaid({
          tenantId: ctx.tenantId,
          rendicionCode: rendicion.code,
          amount: rendicion.amount,
          submitterEmail,
          paymentCode: code,
        }).catch((err) =>
          console.error("[Finance] Error sending paid notification:", err),
        );
      }
    }

    return NextResponse.json({ success: true, data: payment }, { status: 201 });
  } catch (error) {
    console.error("[Finance] Error creating payment:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo crear el pago" },
      { status: 500 },
    );
  }
}
