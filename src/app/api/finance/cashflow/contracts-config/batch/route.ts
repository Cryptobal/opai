import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseBody,
  requireAuth,
  unauthorized,
  resolveApiPerms,
} from "@/lib/api-auth";
import { hasCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * PATCH masivo de monto, vigencia e IPC de items source=CONTRACT.
 *
 * Se invoca desde `/finanzas/configuracion/contratos`. El calendario de
 * emisión/cobro ya no se edita acá (vive en programaciones).
 *
 * Side effect: borra las `FinanceCashflowOccurrence` PROYECTADAS futuras
 * de cada item afectado. Aunque el calendario no cambie, un cambio de
 * monto/vigencia/IPC deja stale el amountClp y las fechas de las
 * occurrences del módulo v2; se regeneran en la próxima proyección.
 */
const itemUpdateSchema = z
  .object({
    id: z.string().uuid(),
    nickname: z.string().max(100).nullable(),
    amount: z.number().positive(),
    currency: z.enum(["CLP", "UF"]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    hasIpcAdjustment: z.boolean(),
    ipcAdjustmentMonths: z.number().int().min(1).max(60).nullable(),
    ipcStartDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  })
  .refine(
    (d) => !d.hasIpcAdjustment || d.ipcAdjustmentMonths != null,
    {
      message:
        "Si hasIpcAdjustment=true, ipcAdjustmentMonths es obligatorio",
      path: ["ipcAdjustmentMonths"],
    },
  )
  .refine((d) => !d.endDate || d.endDate >= d.startDate, {
    message: "endDate debe ser >= startDate",
    path: ["endDate"],
  });

const batchSchema = z.object({
  items: z.array(itemUpdateSchema).min(1).max(100),
});

export async function PATCH(request: NextRequest) {
  const ctx = await requireAuth();
  if (!ctx) return unauthorized();
  const perms = await resolveApiPerms(ctx);
  if (!hasCapability(perms, "cashflow_configure")) {
    return NextResponse.json(
      { success: false, error: "Sin permisos" },
      { status: 403 },
    );
  }
  const parsed = await parseBody(request, batchSchema);
  if (parsed.error) return parsed.error;

  const ids = parsed.data.items.map((i) => i.id);
  const ownership = await prisma.financeCashflowItem.findMany({
    where: { id: { in: ids }, tenantId: ctx.tenantId },
    select: { id: true },
  });
  if (ownership.length !== ids.length) {
    return NextResponse.json(
      { success: false, error: "Algunos items no pertenecen al tenant" },
      { status: 403 },
    );
  }

  await prisma.$transaction([
    ...parsed.data.items.flatMap((item) => [
      prisma.financeCashflowItem.update({
        where: { id: item.id },
        data: {
          nickname: item.nickname,
          amount: item.amount,
          currency: item.currency,
          startDate: new Date(item.startDate + "T00:00:00Z"),
          endDate: item.endDate
            ? new Date(item.endDate + "T00:00:00Z")
            : null,
          hasIpcAdjustment: item.hasIpcAdjustment,
          ipcAdjustmentMonths: item.hasIpcAdjustment
            ? item.ipcAdjustmentMonths
            : null,
          ipcStartDate: item.ipcStartDate
            ? new Date(item.ipcStartDate + "T00:00:00Z")
            : null,
        },
      }),
      // Monto/vigencia cambian → regenerar occurrences PROJECTED del v2.
      prisma.financeCashflowOccurrence.deleteMany({
        where: {
          tenantId: ctx.tenantId,
          itemId: item.id,
          status: "PROJECTED",
          scheduledDate: { gte: new Date() },
        },
      }),
    ]),
  ]);

  return NextResponse.json({
    success: true,
    data: { updated: parsed.data.items.length },
  });
}
