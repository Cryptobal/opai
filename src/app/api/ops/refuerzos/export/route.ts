import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, unauthorized } from "@/lib/api-auth";
import { ensureOpsAccess } from "@/lib/ops";
import { listRefuerzoQuerySchema } from "@/lib/validations/ops";
import { resolveRefuerzoStatus } from "@/lib/ops-refuerzos";

type RefuerzoExportRow = {
  status: "solicitado" | "en_curso" | "realizado" | "facturado";
  endAt: Date;
  installation: { name: string };
  account?: { name: string } | null;
  guardia: { persona: { firstName: string; lastName: string; rut?: string | null } };
  requestedByName?: string | null;
  requestChannel?: string | null;
  startAt: Date;
  guardPaymentClp: unknown;
  estimatedTotalClp: unknown;
  paymentCondition?: string | null;
  invoiceNumber?: string | null;
};

function escapeCsv(value: unknown): string {
  const raw = String(value ?? "");
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireAuth();
    if (!ctx) return unauthorized();
    const forbidden = await ensureOpsAccess(ctx);
    if (forbidden) return forbidden;

    const paramsObject = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsedQuery = listRefuerzoQuerySchema.safeParse(paramsObject);
    if (!parsedQuery.success) {
      return NextResponse.json(
        { success: false, error: parsedQuery.error.issues.map((i) => i.message).join("; ") },
        { status: 400 }
      );
    }
    const query = parsedQuery.data;

    const prismaAny = prisma as unknown as {
      opsRefuerzoSolicitud?: {
        findMany: (args: unknown) => Promise<RefuerzoExportRow[]>;
      };
    };
    if (!prismaAny.opsRefuerzoSolicitud) {
      return NextResponse.json(
        { success: false, error: "Funcionalidad no disponible: falta sincronizar migraciones de refuerzos" },
        { status: 503 }
      );
    }

    const rows = await prismaAny.opsRefuerzoSolicitud.findMany({
      where: {
        tenantId: ctx.tenantId,
        ...(query.installationId ? { installationId: query.installationId } : {}),
        ...(query.accountId ? { accountId: query.accountId } : {}),
        ...(query.guardiaId ? { guardiaId: query.guardiaId } : {}),
        ...(query.from || query.to
          ? {
              startAt: {
                ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
                ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
              },
            }
          : {}),
      },
      include: {
        installation: { select: { name: true } },
        account: { select: { name: true } },
        guardia: { select: { persona: { select: { firstName: true, lastName: true, rut: true } } } },
      },
      orderBy: [{ startAt: "desc" }],
      take: 2000,
    });

    const now = new Date();
    const filtered = rows.filter((row) => {
      const status = resolveRefuerzoStatus(row.status, row.endAt, now);
      if (query.status && status !== query.status) return false;
      if (query.pendingBilling && status === "facturado") return false;
      if (query.q) {
        const haystack = `${row.installation.name} ${row.account?.name ?? ""} ${row.guardia.persona.firstName} ${row.guardia.persona.lastName}`.toLowerCase();
        if (!haystack.includes(query.q.toLowerCase())) return false;
      }
      return true;
    });

    const header = [
      "instalacion",
      "cliente",
      "guardia",
      "rut_guardia",
      "solicitado_por",
      "canal",
      "inicio",
      "fin",
      "estado",
      "monto_guardia_clp",
      "monto_estimado_clp",
      "condicion_pago",
      "numero_factura",
    ];

    const lines = filtered.map((row) => {
      const status = resolveRefuerzoStatus(row.status, row.endAt, now);
      const guardiaName = `${row.guardia.persona.firstName} ${row.guardia.persona.lastName}`.trim();
      return [
        row.installation.name,
        row.account?.name ?? "",
        guardiaName,
        row.guardia.persona.rut ?? "",
        row.requestedByName ?? "",
        row.requestChannel ?? "",
        row.startAt.toISOString(),
        row.endAt.toISOString(),
        status,
        Number(row.guardPaymentClp),
        Number(row.estimatedTotalClp),
        row.paymentCondition ?? "",
        row.invoiceNumber ?? "",
      ]
        .map(escapeCsv)
        .join(",");
    });

    const csv = [header.join(","), ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="refuerzos-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("[OPS] Error exporting refuerzos:", error);
    return NextResponse.json(
      { success: false, error: "No se pudo exportar" },
      { status: 500 }
    );
  }
}
