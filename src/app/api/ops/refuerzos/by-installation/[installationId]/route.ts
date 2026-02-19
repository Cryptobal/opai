import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { resolveRefuerzoStatus } from "@/lib/ops-refuerzos";

type Params = { installationId: string };
type RefuerzoInstallationRow = {
  status: "solicitado" | "en_curso" | "realizado" | "facturado";
  endAt: Date;
  guardPaymentClp: unknown;
  estimatedTotalClp: unknown;
  turnoExtra?: { id: string; status: string; amountClp: unknown; paidAt?: Date | null } | null;
};

export async function GET(_: Request, { params }: { params: Promise<Params> }) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const prismaAny = prisma as unknown as {
      opsRefuerzoSolicitud?: {
        findMany: (args: unknown) => Promise<RefuerzoInstallationRow[]>;
      };
    };
    if (!prismaAny.opsRefuerzoSolicitud) {
      return NextResponse.json(
        { success: false, error: "Funcionalidad no disponible: falta sincronizar migraciones de refuerzos" },
        { status: 503 }
      );
    }

    const { installationId } = await params;
    const rows = await prismaAny.opsRefuerzoSolicitud.findMany({
      where: {
        tenantId: ctx.tenantId,
        installationId,
      },
      include: {
        guardia: {
          select: {
            id: true,
            code: true,
            persona: { select: { firstName: true, lastName: true, rut: true } },
          },
        },
        puesto: { select: { id: true, name: true } },
        turnoExtra: { select: { id: true, status: true, amountClp: true, paidAt: true } },
      },
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    });

    const now = new Date();
    const data = rows.map((row) => ({
      ...row,
      status: resolveRefuerzoStatus(row.status, row.endAt, now),
      guardPaymentClp: Number(row.guardPaymentClp),
      estimatedTotalClp: Number(row.estimatedTotalClp),
      turnoExtra: row.turnoExtra
        ? { ...row.turnoExtra, amountClp: Number(row.turnoExtra.amountClp) }
        : null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("[OPS] Error listing refuerzos by installation:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo obtener el historial de refuerzos" },
      { status: 500 }
    );
  }
}
