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
 * PATCH masivo de los campos del ciclo de cobro de items source=CONTRACT.
 *
 * Se invoca desde la vista de setup masivo
 * (`/finanzas/configuracion/contratos-cobro`) con un batch de items
 * editados inline. Solo accesible con capability `cashflow_configure`.
 *
 * Normalización (FIX 2 de Fase 3): cuando un item tiene
 * `emiteProforma=true`, los campos `diaEmisionFactura` y
 * `mesFacturaRelativo` no aplican (la fecha se deriva de proforma +
 * días). Forzamos `null` / `MISMO_MES` antes de persistir para evitar
 * contaminar la DB con valores residuales.
 *
 * Side effect: borra las `FinanceCashflowOccurrence` PROYECTADAS
 * futuras de cada item afectado, para que la próxima proyección las
 * regenere con el calendario nuevo. Las occurrences pagadas/conciliadas
 * (status != PROJECTED) se conservan.
 */
const itemUpdateSchema = z.object({
  id: z.string().uuid(),
  nickname: z.string().max(100).nullable(),
  emiteProforma: z.boolean(),
  diaEmisionProforma: z.number().int().nullable(),
  diasFacturaDesdeProforma: z.number().int().min(0).max(60).nullable(),
  diaEmisionFactura: z.number().int().nullable(),
  mesFacturaRelativo: z.enum(["MISMO_MES", "MES_SIGUIENTE"]),
  modoCobro: z.enum(["DIRECTO", "FACTORING"]),
  diasCobroDesdeFactura: z.number().int().min(0).max(180),
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
    ...parsed.data.items.flatMap((item) => {
      // Normalización: cuando hay proforma, diaEmisionFactura no aplica
      // y mesFacturaRelativo es irrelevante. Forzamos null/MISMO_MES.
      const normDiaFactura = item.emiteProforma
        ? null
        : item.diaEmisionFactura;
      const normMesFactura: "MISMO_MES" | "MES_SIGUIENTE" = item.emiteProforma
        ? "MISMO_MES"
        : item.mesFacturaRelativo;
      return [
        prisma.financeCashflowItem.update({
          where: { id: item.id },
          data: {
            nickname: item.nickname,
            emiteProforma: item.emiteProforma,
            diaEmisionProforma: item.diaEmisionProforma,
            diasFacturaDesdeProforma: item.diasFacturaDesdeProforma,
            diaEmisionFactura: normDiaFactura,
            mesFacturaRelativo: normMesFactura,
            modoCobro: item.modoCobro,
            diasCobroDesdeFactura: item.diasCobroDesdeFactura,
          },
        }),
        // Limpiar Occurrences PROYECTADAS futuras al cambiar calendario.
        prisma.financeCashflowOccurrence.deleteMany({
          where: {
            tenantId: ctx.tenantId,
            itemId: item.id,
            status: "PROJECTED",
            scheduledDate: { gte: new Date() },
          },
        }),
      ];
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: { updated: parsed.data.items.length },
  });
}
