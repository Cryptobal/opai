import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, requireAuth, unauthorized } from "@/lib/api-auth";
import { upsertPautaItemSchema } from "@/lib/validations/ops";
import { createOpsAuditLog, ensureOpsAccess, parseDateOnly } from "@/lib/ops";

const bulkSaveSchema = z.object({
  items: z.array(upsertPautaItemSchema).min(1, "Debes enviar al menos 1 registro"),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const parsed = await parseBody(request, bulkSaveSchema);
    if (parsed.error) return parsed.error;
    const body = parsed.data;

    const uniquePuestoIds = Array.from(new Set(body.items.map((item) => item.puestoId)));
    const puestos = await prisma.opsPuestoOperativo.findMany({
      where: {
        tenantId: ctx.tenantId,
        id: { in: uniquePuestoIds },
      },
      select: {
        id: true,
        installationId: true,
      },
    });

    if (puestos.length !== uniquePuestoIds.length) {
      return NextResponse.json(
        { success: false, error: "Uno o más puestos no existen para el tenant actual" },
        { status: 404 }
      );
    }

    const puestoById = new Map(puestos.map((p) => [p.id, p]));

    const results = await prisma.$transaction(
      body.items.map((item) =>
        prisma.opsPautaMensual.upsert({
          where: {
            puestoId_slotNumber_date: {
              puestoId: item.puestoId,
              slotNumber: item.slotNumber,
              date: parseDateOnly(item.date),
            },
          },
          create: {
            tenantId: ctx.tenantId,
            installationId: puestoById.get(item.puestoId)!.installationId,
            puestoId: item.puestoId,
            slotNumber: item.slotNumber,
            date: parseDateOnly(item.date),
            plannedGuardiaId: item.plannedGuardiaId ?? null,
            shiftCode: item.shiftCode ?? null,
            status: item.status,
            notes: item.notes ?? null,
            createdBy: ctx.userId,
          },
          update: {
            plannedGuardiaId: item.plannedGuardiaId ?? null,
            shiftCode: item.shiftCode ?? null,
            status: item.status,
            notes: item.notes ?? null,
          },
        })
      )
    );
    const firstItem = body.items[0];
    const installationId = firstItem ? puestoById.get(firstItem.puestoId)?.installationId : undefined;

    await createOpsAuditLog(ctx, "ops.pauta.bulk_saved", "ops_pauta", installationId, {
      installationId: installationId ?? null,
      total: results.length,
    });

    return NextResponse.json({
      success: true,
      data: {
        count: results.length,
      },
    });
  } catch (error) {
    console.error("[OPS] Error saving pauta bulk:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo guardar la pauta mensual" },
      { status: 500 }
    );
  }
}
