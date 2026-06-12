import { NextRequest, NextResponse } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { requireAuth, unauthorized, resolveApiPerms } from "@/lib/api-auth";
import { hasFacturacionCapability } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { todayChileStr } from "@/lib/fx-date";

const CHILE_TZ = "America/Santiago";

/**
 * Histórico global de correos de facturación (proformas, estados de pago,
 * facturas/DTEs) de un mes calendario.
 *
 * Lee `FinanceDteEmailLog` directamente — SIN exigir que el DTE siga
 * existiendo. Esto es deliberado: los envíos de proforma se hacen sobre
 * borradores que muchas veces se eliminan después de emitir la factura
 * definitiva, y esos logs quedaban invisibles en la UI (el único
 * historial era el timeline por-DTE).
 *
 * Query params:
 *   - month: "YYYY-MM" (default: mes actual en Chile).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const perms = await resolveApiPerms(ctx);
    if (!hasFacturacionCapability(perms, "facturacion_view")) {
      return NextResponse.json(
        { success: false, error: "Sin permisos" },
        { status: 403 },
      );
    }

    const monthParam = request.nextUrl.searchParams.get("month");
    const month =
      monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)
        ? monthParam
        : todayChileStr().slice(0, 7);

    // Límites del mes calendario en hora de Chile → UTC.
    const [y, m] = month.split("-").map(Number);
    const start = fromZonedTime(`${month}-01T00:00:00`, CHILE_TZ);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    const end = fromZonedTime(`${nextMonth}-01T00:00:00`, CHILE_TZ);

    const logs = await prisma.financeDteEmailLog.findMany({
      where: {
        tenantId: ctx.tenantId,
        sentAt: { gte: start, lt: end },
      },
      orderBy: { sentAt: "desc" },
      // Cota de seguridad: un mes normal del tenant son <100 envíos.
      take: 1000,
      select: {
        id: true,
        dteId: true,
        kind: true,
        to: true,
        cc: true,
        bcc: true,
        subject: true,
        status: true,
        errorMessage: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        openCount: true,
        bouncedAt: true,
        complainedAt: true,
      },
    });

    // Datos del DTE en query separada (NO include): hay logs cuyo DTE fue
    // eliminado (borradores) y un include de relación requerida lanzaría
    // "field dte is required to return data, got null".
    const dteIds = Array.from(new Set(logs.map((l) => l.dteId)));
    const dtes = dteIds.length
      ? await prisma.financeDte.findMany({
          where: { id: { in: dteIds }, tenantId: ctx.tenantId },
          select: {
            id: true,
            folio: true,
            dteType: true,
            siiStatus: true,
            receiverName: true,
          },
        })
      : [];
    const dteById = new Map(dtes.map((d) => [d.id, d]));

    return NextResponse.json({
      success: true,
      data: {
        month,
        logs: logs.map((l) => {
          const dte = dteById.get(l.dteId) ?? null;
          return {
            ...l,
            dte: dte
              ? {
                  id: dte.id,
                  folio: dte.folio,
                  dteType: dte.dteType,
                  siiStatus: dte.siiStatus,
                  receiverName: dte.receiverName,
                }
              : null,
          };
        }),
      },
    });
  } catch (error) {
    console.error("[Finance/Billing/EmailHistory] Error:", error);
    return NextResponse.json(
      { success: false, error: "Error al listar envíos" },
      { status: 500 },
    );
  }
}
